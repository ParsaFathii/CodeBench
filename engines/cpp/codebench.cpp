// CodeBench — C++ benchmark engine (Google Benchmark harness)
//
// One process executes one job selected via environment variables:
//   CB_VARIANT   variant id            (e.g. "merge_sort")
//   CB_DATASET   dataset type          (e.g. "random_int")
//   CB_SIZE      input size
//   CB_SEED      deterministic seed
//   CB_WARMUP    explicit warmup ops before the harness measurement
//   CB_VERIFY_OUT path of the verification JSON sidecar
//   CB_MODE      "bench" (default) | "verify" (verification only, no timing)
//
// Google Benchmark drives the timed loop:  --benchmark_filter=^BM_<variant>$
// --benchmark_repetitions=R --benchmark_min_time=...s --benchmark_format=json
// --benchmark_out=...   One repetition == one raw observation (ns/op).
//
// Verification is performed BEFORE any timing: the exact measured input and a
// set of fixed small cases are run untimed and their FNV-1a 64 checksums are
// written to the sidecar. The coordinator compares these checksums across
// languages and against the TypeScript reference implementation.
//
// Copyright © 2026 Parsa Fathi — Apache-2.0 (see LICENSE)

#include <benchmark/benchmark.h>

#include <algorithm>
#include <cstdint>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <deque>
#include <fstream>
#include <functional>
#include <queue>
#include <sstream>
#include <string>
#include <unordered_map>
#include <vector>

namespace cb {

// ---------------------------------------------------------------------------
// SplitMix64 — bit-identical to the TypeScript/Java/Python generators
// ---------------------------------------------------------------------------
struct SplitMix64 {
  uint64_t state;
  explicit SplitMix64(uint64_t seed) {
    uint64_t s = seed + 0x9E3779B97F4A7C15ULL;
    state = mix(s);
  }
  static uint64_t mix(uint64_t z) {
    z = (z ^ (z >> 30)) * 0xBF58476D1CE4E5B9ULL;
    z = (z ^ (z >> 27)) * 0x94D049BB133111EBULL;
    return z ^ (z >> 31);
  }
  uint64_t next() {
    state += 0x9E3779B97F4A7C15ULL;
    return mix(state);
  }
  int64_t randInt(int64_t lo, int64_t hi) {
    uint64_t range = (uint64_t)(hi - lo + 1);
    return lo + (int64_t)(next() % range);
  }
};

// FNV-1a 64 over a byte string (canonical checksum)
std::string fnv1aHex(const std::string& s) {
  uint64_t hash = 0xcbf29ce484222325ULL;
  for (unsigned char c : s) {
    hash ^= c;
    hash *= 0x100000001b3ULL;
  }
  char buf[32];
  snprintf(buf, sizeof(buf), "%016llx", (unsigned long long)hash);
  return std::string(buf);
}

// ---------------------------------------------------------------------------
// Datasets — generation order and value ranges match the other engines exactly
// ---------------------------------------------------------------------------
std::vector<int32_t> genRandomInt(int n, uint64_t seed) {
  SplitMix64 rng(seed);
  std::vector<int32_t> out(n);
  for (int i = 0; i < n; i++) out[i] = (int32_t)rng.randInt(-2147483648LL, 2147483647LL);
  return out;
}
std::vector<int32_t> genSorted(int n, uint64_t seed) {
  SplitMix64 rng(seed);
  std::vector<int32_t> out(n);
  int64_t v = rng.randInt(0, 1000);
  for (int i = 0; i < n; i++) {
    out[i] = (int32_t)v;
    v += rng.randInt(0, 100);
  }
  return out;
}
std::vector<int32_t> genReverseSorted(int n, uint64_t seed) {
  SplitMix64 rng(seed);
  std::vector<int32_t> out(n);
  int64_t v = rng.randInt(0, 1000);
  for (int i = 0; i < n; i++) {
    out[i] = (int32_t)v;
    v -= rng.randInt(0, 100);
  }
  return out;
}
std::vector<int32_t> genNearlySorted(int n, uint64_t seed) {
  SplitMix64 rng(seed); // one continuous stream: sorted prefix, then swaps
  std::vector<int32_t> out(n);
  int64_t v = rng.randInt(0, 1000);
  for (int i = 0; i < n; i++) {
    out[i] = (int32_t)v;
    v += rng.randInt(0, 100);
  }
  int k = n / 100 > 1 ? n / 100 : 1;
  for (int s = 0; s < k; s++) {
    int i = (int)rng.randInt(0, n - 2);
    int j = (int)(i + rng.randInt(1, 50));
    if (j >= n) j = n - 1;
    std::swap(out[i], out[j]);
  }
  return out;
}
std::vector<int32_t> genDuplicateHeavy(int n, uint64_t seed) {
  SplitMix64 rng(seed);
  std::vector<int32_t> out(n);
  for (int i = 0; i < n; i++) out[i] = (int32_t)rng.randInt(-50, 50);
  return out;
}

struct SearchData {
  int n;
  std::vector<int64_t> arr;
  std::vector<int64_t> queries;
};
SearchData genSearchMixed(int n, uint64_t seed) {
  SplitMix64 rng(seed);
  SearchData d;
  d.n = n;
  d.arr.resize(n);
  for (int i = 0; i < n; i++) d.arr[i] = 2LL * i;
  d.queries.resize(n);
  for (int j = 0; j < n; j++) {
    if (j % 2 == 0) d.queries[j] = d.arr[(size_t)rng.randInt(0, n - 1)];
    else d.queries[j] = d.arr[(size_t)rng.randInt(0, n - 1)] + 1; // odd -> miss
  }
  return d;
}

struct Graph {
  int n;
  std::vector<std::vector<std::pair<int, int>>> adj; // (to, weight)
};
Graph genGraphSparse(int n, uint64_t seed) {
  SplitMix64 rng(seed);
  Graph g;
  g.n = n;
  g.adj.assign(n, {});
  for (int u = 0; u < n; u++) {
    for (int k = 0; k < 6; k++) {
      int to = (int)rng.randInt(0, n - 1);
      int w = (int)rng.randInt(1, 1000);
      g.adj[u].push_back({to, w});
    }
  }
  return g;
}

struct Corpus {
  int n;
  std::string text;
  std::string pattern; // length 32
};
Corpus genTextCorpus(int n, uint64_t seed) {
  SplitMix64 rng(seed);
  static const char alpha[4] = {'A', 'C', 'G', 'T'};
  Corpus c;
  c.n = n;
  c.pattern.resize(32);
  for (int i = 0; i < 32; i++) c.pattern[i] = alpha[rng.randInt(0, 3)];
  c.text.resize(n);
  for (int i = 0; i < n; i++) c.text[i] = alpha[rng.randInt(0, 3)];
  int pos = n / 2;
  memcpy(&c.text[(size_t)pos], c.pattern.data(), 32);
  return c;
}

struct Matrix {
  int n;
  std::vector<int32_t> a, b; // row-major
};
Matrix genBoundedMatrix(int n, uint64_t seed) {
  SplitMix64 rng(seed);
  Matrix m;
  m.n = n;
  m.a.resize((size_t)n * n);
  for (int i = 0; i < n * n; i++) m.a[(size_t)i] = (int32_t)rng.randInt(-100, 100);
  m.b.resize((size_t)n * n);
  for (int i = 0; i < n * n; i++) m.b[(size_t)i] = (int32_t)rng.randInt(-100, 100);
  return m;
}

std::vector<int32_t> genDistinctShuffle(int n, uint64_t seed) {
  SplitMix64 rng(seed);
  std::vector<int32_t> a(n);
  for (int i = 0; i < n; i++) a[(size_t)i] = i;
  for (int i = n - 1; i > 0; i--) {
    int j = (int)rng.randInt(0, i);
    std::swap(a[(size_t)i], a[(size_t)j]);
  }
  return a;
}

// ---------------------------------------------------------------------------
// Canonical encodings
// ---------------------------------------------------------------------------
template <typename T>
std::string joinInts(const std::vector<T>& v) {
  std::string s;
  s.reserve(v.size() * 4);
  char buf[24];
  for (size_t i = 0; i < v.size(); i++) {
    if (i) s.push_back(',');
    if constexpr (std::is_same_v<T, int32_t>) snprintf(buf, sizeof(buf), "%d", v[i]);
    else snprintf(buf, sizeof(buf), "%lld", (long long)v[i]);
    s += buf;
  }
  return s;
}

std::string canonicalInputFor(const std::string& dataset, int n, uint64_t seed) {
  if (dataset == "random_int") return joinInts(genRandomInt(n, seed));
  if (dataset == "sorted") return joinInts(genSorted(n, seed));
  if (dataset == "reverse_sorted") return joinInts(genReverseSorted(n, seed));
  if (dataset == "nearly_sorted") return joinInts(genNearlySorted(n, seed));
  if (dataset == "duplicate_heavy") return joinInts(genDuplicateHeavy(n, seed));
  if (dataset == "search_mixed") {
    SearchData d = genSearchMixed(n, seed);
    return joinInts(d.arr) + "|" + joinInts(d.queries);
  }
  if (dataset == "graph_sparse") {
    Graph g = genGraphSparse(n, seed);
    std::string s;
    char buf[64];
    for (int u = 0; u < g.n; u++)
      for (auto& e : g.adj[(size_t)u]) {
        if (!s.empty()) s.push_back(',');
        snprintf(buf, sizeof(buf), "%d:%d:%d", u, e.first, e.second);
        s += buf;
      }
    return s;
  }
  if (dataset == "text_corpus") {
    Corpus c = genTextCorpus(n, seed);
    return c.text + "|" + c.pattern;
  }
  if (dataset == "bounded_matrix") {
    Matrix m = genBoundedMatrix(n, seed);
    return joinInts(m.a) + "|" + joinInts(m.b);
  }
  return "";
}

// ---------------------------------------------------------------------------
// Hand-written binary min-heap over int64 (identical logic in all engines)
// ---------------------------------------------------------------------------
struct MinHeap {
  std::vector<int64_t> a;
  void push(int64_t v) {
    a.push_back(v);
    size_t i = a.size() - 1;
    while (i > 0) {
      size_t p = (i - 1) / 2;
      if (a[p] <= a[i]) break;
      std::swap(a[p], a[i]);
      i = p;
    }
  }
  int64_t pop() {
    int64_t top = a[0];
    a[0] = a.back();
    a.pop_back();
    size_t i = 0, n = a.size();
    while (true) {
      size_t c = 2 * i + 1;
      if (c >= n) break;
      if (c + 1 < n && a[c + 1] < a[c]) c++;
      if (a[i] <= a[c]) break;
      std::swap(a[i], a[c]);
      i = c;
    }
    return top;
  }
  bool empty() const { return a.empty(); }
};

// ---------------------------------------------------------------------------
// Sorting algorithms (hand-written, identical structure across languages)
// ---------------------------------------------------------------------------
void insertionSortRange(std::vector<int32_t>& a, int lo, int hi) {
  for (int i = lo + 1; i < hi; i++) {
    int32_t v = a[(size_t)i];
    int k = i - 1;
    while (k >= lo && a[(size_t)k] > v) {
      a[(size_t)k + 1] = a[(size_t)k];
      k--;
    }
    a[(size_t)k + 1] = v;
  }
}

void mergeSort(std::vector<int32_t>& a) {
  const int n = (int)a.size();
  std::vector<int32_t> aux(a.size());
  std::function<void(int, int)> rec = [&](int lo, int hi) {
    if (hi - lo <= 1) return;
    int mid = lo + (hi - lo) / 2;
    rec(lo, mid);
    rec(mid, hi);
    int i = lo, l = lo, r = mid;
    while (l < mid && r < hi) aux[(size_t)i++] = a[(size_t)l] <= a[(size_t)r] ? a[(size_t)l++] : a[(size_t)r++];
    while (l < mid) aux[(size_t)i++] = a[(size_t)l++];
    while (r < hi) aux[(size_t)i++] = a[(size_t)r++];
    for (int k = lo; k < hi; k++) a[(size_t)k] = aux[(size_t)k];
  };
  rec(0, n);
}

void quickSort(std::vector<int32_t>& a) {
  std::function<void(int, int)> rec = [&](int lo, int hi) {
    while (hi - lo > 16) {
      int mid = lo + (hi - lo) / 2;
      int32_t x = a[(size_t)lo], y = a[(size_t)mid], z = a[(size_t)hi - 1];
      if (x > y) std::swap(x, y);
      if (y > z) std::swap(y, z);
      if (x > y) std::swap(x, y);
      int32_t pivot = y;
      int i = lo, k = lo, j = hi;
      while (k < j) {
        if (a[(size_t)k] < pivot) std::swap(a[(size_t)i++], a[(size_t)k++]);
        else if (a[(size_t)k] > pivot) std::swap(a[(size_t)k], a[(size_t)--j]);
        else k++;
      }
      if (i - lo < hi - j) {
        rec(lo, i);
        lo = j;
      } else {
        rec(j, hi);
        hi = i;
      }
    }
    insertionSortRange(a, lo, hi);
  };
  rec(0, (int)a.size());
}

void heapSort(std::vector<int32_t>& a) {
  const int n = (int)a.size();
  auto siftDown = [&](int start, int end) {
    int root = start;
    for (;;) {
      int c = 2 * root + 1;
      if (c > end) break;
      if (c + 1 <= end && a[(size_t)c] < a[(size_t)c + 1]) c++;
      if (a[(size_t)root] < a[(size_t)c]) {
        std::swap(a[(size_t)root], a[(size_t)c]);
        root = c;
      } else break;
    }
  };
  for (int start = (n - 2) / 2; start >= 0; start--) siftDown(start, n - 1);
  for (int end = n - 1; end > 0; end--) {
    std::swap(a[0], a[(size_t)end]);
    siftDown(0, end - 1);
  }
}

// ---------------------------------------------------------------------------
// Workload holder + one measured operation per variant
// ---------------------------------------------------------------------------
struct Workload {
  // sorting
  std::vector<int32_t> sortInput;
  // search
  SearchData search;
  std::unordered_map<int64_t, int64_t> hashMap;
  // data structures
  std::vector<int32_t> stream; // random_int stream
  std::vector<int32_t> distinctStream;
  // graphs
  Graph graph;
  // strings
  Corpus corpus;
  // matrix
  Matrix matrix;
  std::vector<int64_t> matrixOut; // int64 accumulate buffer
};

std::vector<int32_t> makeSortInput(const std::string& dataset, int n, uint64_t seed) {
  if (dataset == "random_int") return genRandomInt(n, seed);
  if (dataset == "sorted") return genSorted(n, seed);
  if (dataset == "reverse_sorted") return genReverseSorted(n, seed);
  if (dataset == "nearly_sorted") return genNearlySorted(n, seed);
  if (dataset == "duplicate_heavy") return genDuplicateHeavy(n, seed);
  return genRandomInt(n, seed);
}

// One measured operation. Results are consumed via the sink so the optimizer
// cannot eliminate the work.
volatile int64_t g_sink = 0;

void runOp(const std::string& variant, Workload& w, size_t& queryIdx) {
  if (variant == "merge_sort" || variant == "quick_sort" || variant == "heap_sort" ||
      variant == "insertion_sort" || variant == "std_sort") {
    std::vector<int32_t> buf(w.sortInput); // defensive copy: part of the op (destructive sort)
    if (variant == "merge_sort") mergeSort(buf);
    else if (variant == "quick_sort") quickSort(buf);
    else if (variant == "heap_sort") heapSort(buf);
    else if (variant == "insertion_sort") insertionSortRange(buf, 0, (int)buf.size());
    else std::sort(buf.begin(), buf.end());
    g_sink += buf[0] + buf.back();
    benchmark::DoNotOptimize(buf.data());
    benchmark::ClobberMemory();
    return;
  }
  if (variant == "linear_search" || variant == "binary_search" || variant == "hash_lookup") {
    int64_t q = w.search.queries[queryIdx % w.search.queries.size()];
    queryIdx++;
    int64_t r = -1;
    if (variant == "linear_search") {
      for (int i = 0; i < w.search.n; i++)
        if (w.search.arr[(size_t)i] == q) { r = i; break; }
    } else if (variant == "binary_search") {
      int lo = 0, hi = w.search.n - 1;
      while (lo <= hi) {
        int mid = lo + (hi - lo) / 2;
        int64_t v = w.search.arr[(size_t)mid];
        if (v == q) { r = mid; break; }
        if (v < q) lo = mid + 1;
        else hi = mid - 1;
      }
    } else {
      auto it = w.hashMap.find(q);
      r = it == w.hashMap.end() ? -1 : it->second;
    }
    g_sink += r;
    return;
  }
  if (variant == "dynamic_array") {
    std::vector<int32_t> v; // fresh container: growth policy is part of the op
    v.reserve(0);
    for (int32_t x : w.stream) v.push_back(x);
    g_sink += v.size() + v.back();
    return;
  }
  if (variant == "queue_ops") {
    std::deque<int32_t> q;
    for (int32_t x : w.stream) q.push_back(x);
    int64_t acc = 0;
    while (!q.empty()) { acc += q.front(); q.pop_front(); }
    g_sink += acc;
    return;
  }
  if (variant == "priority_queue_ops") {
    MinHeap heap;
    for (int32_t x : w.distinctStream) heap.push(x);
    int64_t acc = 0;
    while (!heap.empty()) acc += heap.pop();
    g_sink += acc;
    return;
  }
  if (variant == "pq_std") {
    std::priority_queue<int32_t, std::vector<int32_t>, std::greater<int32_t>> pq;
    for (int32_t x : w.distinctStream) pq.push(x);
    int64_t acc = 0;
    while (!pq.empty()) { acc += pq.top(); pq.pop(); }
    g_sink += acc;
    return;
  }
  if (variant == "hash_map_ops") {
    std::unordered_map<int64_t, int64_t> m;
    m.reserve(w.distinctStream.size());
    int64_t acc = 0;
    for (size_t i = 0; i < w.distinctStream.size(); i++) m[(int64_t)w.distinctStream[i]] = (int64_t)i;
    for (int32_t k : w.distinctStream) {
      auto it = m.find((int64_t)k);
      acc += it == m.end() ? -1 : it->second;
    }
    for (int32_t k : w.distinctStream) m.erase((int64_t)k);
    g_sink += acc + (int64_t)m.size();
    return;
  }
  if (variant == "bfs" || variant == "dfs") {
    // visited reset is part of the measured op (documented)
    std::vector<char> visited((size_t)w.graph.n, 0);
    std::vector<int> order;
    order.reserve((size_t)w.graph.n);
    if (variant == "bfs") {
      std::deque<int> q;
      q.push_back(0);
      visited[0] = 1;
      while (!q.empty()) {
        int u = q.front();
        q.pop_front();
        order.push_back(u);
        for (auto& e : w.graph.adj[(size_t)u])
          if (!visited[(size_t)e.first]) { visited[(size_t)e.first] = 1; q.push_back(e.first); }
      }
    } else {
      std::vector<int> st;
      st.push_back(0);
      visited[0] = 1;
      while (!st.empty()) {
        int u = st.back();
        st.pop_back();
        order.push_back(u);
        for (int i = (int)w.graph.adj[(size_t)u].size() - 1; i >= 0; i--) {
          int v2 = w.graph.adj[(size_t)u][(size_t)i].first;
          if (!visited[(size_t)v2]) { visited[(size_t)v2] = 1; st.push_back(v2); }
        }
      }
    }
    int64_t acc = 0;
    for (size_t i = 0; i < order.size(); i++) acc += order[i];
    g_sink += acc;
    return;
  }
  if (variant == "dijkstra") {
    const int64_t SHIFT = 1048576; // 2^20 — matches all engines
    const int n = w.graph.n;
    std::vector<int64_t> dist((size_t)n, -1);
    std::vector<char> done((size_t)n, 0);
    MinHeap heap;
    dist[0] = 0;
    heap.push(0);
    while (!heap.empty()) {
      int64_t enc = heap.pop();
      int64_t d = enc / SHIFT;
      int u = (int)(enc % SHIFT);
      if (done[(size_t)u]) continue;
      done[(size_t)u] = 1;
      for (auto& e : w.graph.adj[(size_t)u]) {
        int64_t nd = d + e.second;
        if (dist[(size_t)e.first] == -1 || nd < dist[(size_t)e.first]) {
          dist[(size_t)e.first] = nd;
          heap.push(nd * SHIFT + e.first);
        }
      }
    }
    int64_t acc = 0;
    for (int i = 0; i < n; i++) acc += dist[(size_t)i];
    g_sink += acc;
    return;
  }
  if (variant == "naive_search" || variant == "kmp") {
    const std::string& text = w.corpus.text;
    const std::string& pat = w.corpus.pattern;
    const int m = (int)pat.size();
    int64_t acc = 0;
    if (variant == "naive_search") {
      for (int i = 0; i + m <= w.corpus.n; i++) {
        bool ok = true;
        for (int k2 = 0; k2 < m; k2++)
          if (text[(size_t)i + (size_t)k2] != pat[(size_t)k2]) { ok = false; break; }
        if (ok) acc += i;
      }
    } else {
      std::vector<int> fail((size_t)m, 0);
      int k2 = 0;
      for (int i = 1; i < m; i++) {
        while (k2 > 0 && pat[(size_t)i] != pat[(size_t)k2]) k2 = fail[(size_t)k2 - 1];
        if (pat[(size_t)i] == pat[(size_t)k2]) k2++;
        fail[(size_t)i] = k2;
      }
      k2 = 0;
      for (int i = 0; i < w.corpus.n; i++) {
        while (k2 > 0 && text[(size_t)i] != pat[(size_t)k2]) k2 = fail[(size_t)k2 - 1];
        if (text[(size_t)i] == pat[(size_t)k2]) k2++;
        if (k2 == m) { acc += i - m + 1; k2 = fail[(size_t)k2 - 1]; }
      }
    }
    g_sink += acc;
    return;
  }
  if (variant == "matmul_naive" || variant == "matmul_ikj") {
    const int n = w.matrix.n;
    int64_t* c = w.matrixOut.data();
    memset(c, 0, sizeof(int64_t) * (size_t)n * (size_t)n);
    const int32_t* a = w.matrix.a.data();
    const int32_t* b = w.matrix.b.data();
    if (variant == "matmul_naive") {
      for (int i = 0; i < n; i++)
        for (int jj = 0; jj < n; jj++) {
          int64_t s = 0;
          for (int kk = 0; kk < n; kk++) s += (int64_t)a[(size_t)i * n + kk] * b[(size_t)kk * n + jj];
          c[(size_t)i * n + jj] = s;
        }
    } else {
      for (int i = 0; i < n; i++)
        for (int kk = 0; kk < n; kk++) {
          int64_t aik = a[(size_t)i * n + kk];
          for (int jj = 0; jj < n; jj++) c[(size_t)i * n + jj] += aik * b[(size_t)kk * n + jj];
        }
    }
    benchmark::DoNotOptimize(c);
    benchmark::ClobberMemory();
    return;
  }
}

// ---------------------------------------------------------------------------
// Verification — canonical output after one untimed operation
// ---------------------------------------------------------------------------
std::string verifyOutput(const std::string& variant, const std::string& dataset, int n, uint64_t seed) {
  if (variant == "merge_sort" || variant == "quick_sort" || variant == "heap_sort" ||
      variant == "insertion_sort" || variant == "std_sort") {
    std::vector<int32_t> buf = makeSortInput(dataset, n, seed);
    if (variant == "merge_sort") mergeSort(buf);
    else if (variant == "quick_sort") quickSort(buf);
    else if (variant == "heap_sort") heapSort(buf);
    else if (variant == "insertion_sort") insertionSortRange(buf, 0, (int)buf.size());
    else std::sort(buf.begin(), buf.end());
    return joinInts(buf);
  }
  if (variant == "linear_search" || variant == "binary_search" || variant == "hash_lookup") {
    SearchData d = genSearchMixed(n, seed);
    std::string out;
    for (int j = 0; j < n; j++) {
      if (j) out.push_back(',');
      int64_t q = d.queries[(size_t)j];
      int64_t r = -1;
      if (variant == "linear_search") {
        for (int i = 0; i < n; i++)
          if (d.arr[(size_t)i] == q) { r = i; break; }
      } else if (variant == "binary_search") {
        int lo = 0, hi = n - 1;
        while (lo <= hi) {
          int mid = lo + (hi - lo) / 2;
          if (d.arr[(size_t)mid] == q) { r = mid; break; }
          if (d.arr[(size_t)mid] < q) lo = mid + 1;
          else hi = mid - 1;
        }
      } else {
        std::unordered_map<int64_t, int64_t> m;
        for (int i = 0; i < n; i++) m[d.arr[(size_t)i]] = i;
        auto it = m.find(q);
        r = it == m.end() ? -1 : it->second;
      }
      char buf[24];
      snprintf(buf, sizeof(buf), "%lld", (long long)r);
      out += buf;
    }
    return out;
  }
  if (variant == "dynamic_array") {
    std::vector<int32_t> v;
    for (int32_t x : genRandomInt(n, seed)) v.push_back(x);
    return joinInts(v);
  }
  if (variant == "queue_ops") {
    std::deque<int32_t> q;
    for (int32_t x : genRandomInt(n, seed)) q.push_back(x);
    std::vector<int32_t> out;
    while (!q.empty()) { out.push_back(q.front()); q.pop_front(); }
    return joinInts(out);
  }
  if (variant == "priority_queue_ops") {
    MinHeap heap;
    for (int32_t x : genDistinctShuffle(n, seed)) heap.push(x);
    std::vector<int32_t> out;
    while (!heap.empty()) out.push_back((int32_t)heap.pop());
    return joinInts(out);
  }
  if (variant == "pq_std") {
    std::priority_queue<int32_t, std::vector<int32_t>, std::greater<int32_t>> pq;
    for (int32_t x : genDistinctShuffle(n, seed)) pq.push(x);
    std::vector<int32_t> out;
    while (!pq.empty()) { out.push_back(pq.top()); pq.pop(); }
    return joinInts(out);
  }
  if (variant == "hash_map_ops") {
    std::vector<int32_t> s = genDistinctShuffle(n, seed);
    std::unordered_map<int64_t, int64_t> m;
    for (size_t i = 0; i < s.size(); i++) m[(int64_t)s[i]] = (int64_t)i;
    std::string out;
    for (size_t j = 0; j < s.size(); j++) {
      if (j) out.push_back(',');
      char buf[24];
      snprintf(buf, sizeof(buf), "%lld", (long long)m[(int64_t)s[j]]);
      out += buf;
    }
    for (int32_t k : s) m.erase((int64_t)k);
    out += "|";
    out += std::to_string(m.size());
    return out;
  }
  if (variant == "bfs" || variant == "dfs") {
    Graph g = genGraphSparse(n, seed);
    std::vector<char> visited((size_t)n, 0);
    std::vector<int> order;
    if (variant == "bfs") {
      std::deque<int> q;
      q.push_back(0);
      visited[0] = 1;
      while (!q.empty()) {
        int u = q.front();
        q.pop_front();
        order.push_back(u);
        for (auto& e : g.adj[(size_t)u])
          if (!visited[(size_t)e.first]) { visited[(size_t)e.first] = 1; q.push_back(e.first); }
      }
    } else {
      std::vector<int> st;
      st.push_back(0);
      visited[0] = 1;
      while (!st.empty()) {
        int u = st.back();
        st.pop_back();
        order.push_back(u);
        for (int i = (int)g.adj[(size_t)u].size() - 1; i >= 0; i--) {
          int v2 = g.adj[(size_t)u][(size_t)i].first;
          if (!visited[(size_t)v2]) { visited[(size_t)v2] = 1; st.push_back(v2); }
        }
      }
    }
    std::string out;
    for (size_t i = 0; i < order.size(); i++) {
      if (i) out.push_back(',');
      out += std::to_string(order[i]);
    }
    return out;
  }
  if (variant == "dijkstra") {
    const int64_t SHIFT = 1048576;
    Graph g = genGraphSparse(n, seed);
    std::vector<int64_t> dist((size_t)n, -1);
    std::vector<char> done((size_t)n, 0);
    MinHeap heap;
    dist[0] = 0;
    heap.push(0);
    while (!heap.empty()) {
      int64_t enc = heap.pop();
      int64_t d = enc / SHIFT;
      int u = (int)(enc % SHIFT);
      if (done[(size_t)u]) continue;
      done[(size_t)u] = 1;
      for (auto& e : g.adj[(size_t)u]) {
        int64_t nd = d + e.second;
        if (dist[(size_t)e.first] == -1 || nd < dist[(size_t)e.first]) {
          dist[(size_t)e.first] = nd;
          heap.push(nd * SHIFT + e.first);
        }
      }
    }
    return joinInts(dist);
  }
  if (variant == "naive_search" || variant == "kmp") {
    Corpus c = genTextCorpus(n, seed);
    std::vector<int> offsets;
    const int m = (int)c.pattern.size();
    if (variant == "naive_search") {
      for (int i = 0; i + m <= c.n; i++) {
        bool ok = true;
        for (int k2 = 0; k2 < m; k2++)
          if (c.text[(size_t)i + (size_t)k2] != c.pattern[(size_t)k2]) { ok = false; break; }
        if (ok) offsets.push_back(i);
      }
    } else {
      std::vector<int> fail((size_t)m, 0);
      int k2 = 0;
      for (int i = 1; i < m; i++) {
        while (k2 > 0 && c.pattern[(size_t)i] != c.pattern[(size_t)k2]) k2 = fail[(size_t)k2 - 1];
        if (c.pattern[(size_t)i] == c.pattern[(size_t)k2]) k2++;
        fail[(size_t)i] = k2;
      }
      k2 = 0;
      for (int i = 0; i < c.n; i++) {
        while (k2 > 0 && c.text[(size_t)i] != c.pattern[(size_t)k2]) k2 = fail[(size_t)k2 - 1];
        if (c.text[(size_t)i] == c.pattern[(size_t)k2]) k2++;
        if (k2 == m) { offsets.push_back(i - m + 1); k2 = fail[(size_t)k2 - 1]; }
      }
    }
    std::string out = std::to_string(offsets.size()) + "|";
    for (size_t i = 0; i < offsets.size(); i++) {
      if (i) out.push_back(',');
      out += std::to_string(offsets[i]);
    }
    return out;
  }
  if (variant == "matmul_naive" || variant == "matmul_ikj") {
    Matrix mm = genBoundedMatrix(n, seed);
    std::vector<int64_t> c((size_t)n * (size_t)n, 0);
    for (int i = 0; i < n; i++)
      for (int jj = 0; jj < n; jj++) {
        int64_t s = 0;
        if (variant == "matmul_naive") {
          for (int kk = 0; kk < n; kk++)
            s += (int64_t)mm.a[(size_t)i * n + kk] * mm.b[(size_t)kk * n + jj];
          c[(size_t)i * n + jj] = s;
        } else {
          for (int kk = 0; kk < n; kk++) c[(size_t)i * n + jj] += (int64_t)mm.a[(size_t)i * n + kk] * mm.b[(size_t)kk * n + jj];
        }
      }
    return joinInts(c);
  }
  return "";
}

} // namespace cb

// ---------------------------------------------------------------------------
// Job configuration from environment
// ---------------------------------------------------------------------------
static std::string g_variant = "merge_sort";
static std::string g_dataset = "random_int";
static int g_size = 10000;
static uint64_t g_seed = 1;
static int g_warmup = 2;

static void BM_codebench(benchmark::State& state) {
  cb::Workload w;
  // untimed setup — regenerated identically for every repetition
  if (g_variant == "linear_search" || g_variant == "binary_search" || g_variant == "hash_lookup") {
    w.search = cb::genSearchMixed(g_size, g_seed);
    if (g_variant == "hash_lookup") {
      w.hashMap.reserve(w.search.arr.size() * 2);
      for (int i = 0; i < w.search.n; i++) w.hashMap[w.search.arr[(size_t)i]] = i;
    }
  } else if (g_variant == "dynamic_array" || g_variant == "queue_ops") {
    w.stream = cb::genRandomInt(g_size, g_seed);
  } else if (g_variant == "priority_queue_ops" || g_variant == "pq_std" || g_variant == "hash_map_ops") {
    w.distinctStream = cb::genDistinctShuffle(g_size, g_seed);
  } else if (g_variant == "bfs" || g_variant == "dfs" || g_variant == "dijkstra") {
    w.graph = cb::genGraphSparse(g_size, g_seed);
  } else if (g_variant == "naive_search" || g_variant == "kmp") {
    w.corpus = cb::genTextCorpus(g_size, g_seed);
  } else if (g_variant == "matmul_naive" || g_variant == "matmul_ikj") {
    w.matrix = cb::genBoundedMatrix(g_size, g_seed);
    w.matrixOut.assign((size_t)g_size * g_size, 0);
  } else {
    w.sortInput = cb::makeSortInput(g_dataset, g_size, g_seed);
  }
  size_t queryIdx = 0;
  for (auto _ : state) cb::runOp(g_variant, w, queryIdx);
  state.SetLabel(g_dataset + ":" + std::to_string(g_size));
}
BENCHMARK(BM_codebench)->UseRealTime()->Unit(benchmark::kNanosecond);

int main(int argc, char** argv) {
  const char* e;
  if ((e = getenv("CB_VARIANT"))) g_variant = e;
  if ((e = getenv("CB_DATASET"))) g_dataset = e;
  if ((e = getenv("CB_SIZE"))) g_size = atoi(e);
  if ((e = getenv("CB_SEED"))) g_seed = strtoull(e, nullptr, 10);
  if ((e = getenv("CB_WARMUP"))) g_warmup = atoi(e);
  std::string mode = getenv("CB_MODE") ? getenv("CB_MODE") : "bench";

  // ---- verification phase (always, before any timing) ----
  if (getenv("CB_VERIFY_OUT")) {
    std::string verifyPath = getenv("CB_VERIFY_OUT");
    std::ostringstream js;
    js << "{\"variant\":\"" << g_variant << "\"";
    js << ",\"input\":\"" << cb::fnv1aHex(cb::canonicalInputFor(g_dataset, g_size, g_seed)) << "\"";
    js << ",\"output\":\"" << cb::fnv1aHex(cb::verifyOutput(g_variant, g_dataset, g_size, g_seed)) << "\"";
    // fixed small cases per algorithm family
    js << ",\"cases\":{";
    bool first = true;
    auto addCase = [&](const std::string& ds, int n, uint64_t seed) {
      if (!first) js << ",";
      first = false;
      js << "\"" << ds << ":" << n << "\":\""
         << cb::fnv1aHex(cb::verifyOutput(g_variant, ds, n, seed)) << "\"";
    };
    const uint64_t VERIFY_SEED = 0xC0DEBEEFULL;
    std::string algo = g_variant.substr(0, g_variant.find('_') == std::string::npos
                                            ? g_variant.size()
                                            : g_variant.find('_'));
    // determine family by checking known prefixes (variant ids are stable)
    std::vector<std::string> sortVariants = {"merge_sort", "quick_sort", "heap_sort", "insertion_sort", "std_sort"};
    std::vector<std::string> searchVariants = {"linear_search", "binary_search", "hash_lookup"};
    std::vector<std::string> dsVariants = {"dynamic_array", "queue_ops", "priority_queue_ops", "pq_std", "hash_map_ops"};
    std::vector<std::string> graphVariants = {"bfs", "dfs", "dijkstra"};
    std::vector<std::string> stringVariants = {"naive_search", "kmp"};
    std::vector<std::string> matrixVariants = {"matmul_naive", "matmul_ikj"};
    if (std::find(sortVariants.begin(), sortVariants.end(), g_variant) != sortVariants.end()) {
      addCase("random_int", 257, VERIFY_SEED);
      addCase("sorted", 257, VERIFY_SEED);
      addCase("reverse_sorted", 257, VERIFY_SEED);
      addCase("nearly_sorted", 257, VERIFY_SEED);
      addCase("duplicate_heavy", 257, VERIFY_SEED);
    } else if (std::find(searchVariants.begin(), searchVariants.end(), g_variant) != searchVariants.end()) {
      addCase("search_mixed", 257, VERIFY_SEED);
    } else if (std::find(dsVariants.begin(), dsVariants.end(), g_variant) != dsVariants.end()) {
      addCase("random_int", 257, VERIFY_SEED);
    } else if (std::find(graphVariants.begin(), graphVariants.end(), g_variant) != graphVariants.end()) {
      addCase("graph_sparse", 61, VERIFY_SEED);
    } else if (std::find(stringVariants.begin(), stringVariants.end(), g_variant) != stringVariants.end()) {
      addCase("text_corpus", 1000, VERIFY_SEED);
    } else if (std::find(matrixVariants.begin(), matrixVariants.end(), g_variant) != matrixVariants.end()) {
      addCase("bounded_matrix", 9, VERIFY_SEED);
    }
    js << "}}";
    std::ofstream f(verifyPath);
    f << js.str();
  }

  if (mode == "verify") return 0; // verification-only mode (engine smoke checks)

  // ---- explicit warmup (untimed), before the harness measurement ----
  {
    cb::Workload w;
    if (g_variant == "linear_search" || g_variant == "binary_search" || g_variant == "hash_lookup") {
      w.search = cb::genSearchMixed(g_size, g_seed);
      if (g_variant == "hash_lookup") {
        w.hashMap.reserve(w.search.arr.size() * 2);
        for (int i = 0; i < w.search.n; i++) w.hashMap[w.search.arr[(size_t)i]] = i;
      }
    } else if (g_variant == "dynamic_array" || g_variant == "queue_ops") {
      w.stream = cb::genRandomInt(g_size, g_seed);
    } else if (g_variant == "priority_queue_ops" || g_variant == "pq_std" || g_variant == "hash_map_ops") {
      w.distinctStream = cb::genDistinctShuffle(g_size, g_seed);
    } else if (g_variant == "bfs" || g_variant == "dfs" || g_variant == "dijkstra") {
      w.graph = cb::genGraphSparse(g_size, g_seed);
    } else if (g_variant == "naive_search" || g_variant == "kmp") {
      w.corpus = cb::genTextCorpus(g_size, g_seed);
    } else if (g_variant == "matmul_naive" || g_variant == "matmul_ikj") {
      w.matrix = cb::genBoundedMatrix(g_size, g_seed);
      w.matrixOut.assign((size_t)g_size * g_size, 0);
    } else {
      w.sortInput = cb::makeSortInput(g_dataset, g_size, g_seed);
    }
    size_t queryIdx = 0;
    for (int i = 0; i < g_warmup; i++) cb::runOp(g_variant, w, queryIdx);
  }

  // ---- Google Benchmark measurement ----
  benchmark::Initialize(&argc, argv);
  if (benchmark::ReportUnrecognizedArguments(argc, argv)) return 1;
  benchmark::RunSpecifiedBenchmarks();
  benchmark::Shutdown();
  return 0;
}

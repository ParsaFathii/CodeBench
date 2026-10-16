// CodeBench — TypeScript reference implementation
//
// Purpose: correctness reference for every benchmark variant. Each language
// runner executes the same fixed verification cases (small deterministic
// inputs) and the coordinator compares the resulting checksums against this
// reference. A variant only enters performance experiments when its canonical
// output checksum matches the reference.
//
// The algorithms here are written for clarity and correctness, not speed.

import { SplitMix64, fnv1a64 } from "./prng";
import type { DatasetType } from "./spec";

// ---------------------------------------------------------------------------
// Dataset generators (bit-identical to the C++/Java/Python generators)
// ---------------------------------------------------------------------------

export interface GraphData {
  n: number;
  adj: { to: number; w: number }[][];
}

export interface SearchData {
  n: number;
  arr: number[]; // sorted distinct even values: arr[i] = 2*i
  queries: number[]; // n queries, mixed hit/miss
}

export interface CorpusData {
  n: number;
  corpus: string;
  pattern: string; // length 32
}

export interface MatrixData {
  n: number;
  a: number[][];
  b: number[][];
}

export function genRandomInt(n: number, seed: number): number[] {
  const rng = new SplitMix64(seed);
  const out = new Array<number>(n);
  for (let i = 0; i < n; i++) out[i] = rng.randInt(-2147483648, 2147483647);
  return out;
}

export function genSorted(n: number, seed: number): number[] {
  const rng = new SplitMix64(seed);
  const out = new Array<number>(n);
  let v = rng.randInt(0, 1000);
  for (let i = 0; i < n; i++) {
    out[i] = v;
    v += rng.randInt(0, 100);
  }
  return out;
}

export function genReverseSorted(n: number, seed: number): number[] {
  const rng = new SplitMix64(seed);
  const out = new Array<number>(n);
  let v = rng.randInt(0, 1000);
  for (let i = 0; i < n; i++) {
    out[i] = v;
    v -= rng.randInt(0, 100);
  }
  return out;
}

export function genNearlySorted(n: number, seed: number): number[] {
  // one continuous rng stream: sorted prefix, then swap positions
  const rng = new SplitMix64(seed);
  const out = new Array<number>(n);
  let v = rng.randInt(0, 1000);
  for (let i = 0; i < n; i++) {
    out[i] = v;
    v += rng.randInt(0, 100);
  }
  const k = Math.max(1, Math.floor(n / 100));
  for (let s = 0; s < k; s++) {
    const i = rng.randInt(0, n - 2);
    let jj = i + rng.randInt(1, 50);
    if (jj >= n) jj = n - 1;
    const tmp = out[i];
    out[i] = out[jj];
    out[jj] = tmp;
  }
  return out;
}

export function genDuplicateHeavy(n: number, seed: number): number[] {
  const rng = new SplitMix64(seed);
  const out = new Array<number>(n);
  for (let i = 0; i < n; i++) out[i] = rng.randInt(-50, 50);
  return out;
}

export function genSearchMixed(n: number, seed: number): SearchData {
  const rng = new SplitMix64(seed);
  const arr = new Array<number>(n);
  for (let i = 0; i < n; i++) arr[i] = 2 * i;
  const queries = new Array<number>(n);
  for (let j = 0; j < n; j++) {
    if (j % 2 === 0) queries[j] = arr[rng.randInt(0, n - 1)];
    else queries[j] = arr[rng.randInt(0, n - 1)] + 1; // odd -> guaranteed miss
  }
  return { n, arr, queries };
}

export function genGraphSparse(n: number, seed: number): GraphData {
  const rng = new SplitMix64(seed);
  const adj: { to: number; w: number }[][] = Array.from({ length: n }, () => []);
  for (let u = 0; u < n; u++) {
    for (let k = 0; k < 6; k++) {
      const to = rng.randInt(0, n - 1);
      const w = rng.randInt(1, 1000);
      adj[u].push({ to, w });
    }
  }
  return { n, adj };
}

export function genTextCorpus(n: number, seed: number): CorpusData {
  const rng = new SplitMix64(seed);
  const alpha = "ACGT";
  let pattern = "";
  for (let i = 0; i < 32; i++) pattern += alpha[rng.randInt(0, 3)];
  let corpus = "";
  for (let i = 0; i < n; i++) corpus += alpha[rng.randInt(0, 3)];
  const pos = Math.floor(n / 2);
  corpus = corpus.slice(0, pos) + pattern + corpus.slice(pos + 32);
  return { n, corpus, pattern };
}

export function genBoundedMatrix(n: number, seed: number): MatrixData {
  const rng = new SplitMix64(seed);
  const a: number[][] = [];
  for (let i = 0; i < n; i++) {
    const row = new Array<number>(n);
    for (let j = 0; j < n; j++) row[j] = rng.randInt(-100, 100);
    a.push(row);
  }
  const b: number[][] = [];
  for (let i = 0; i < n; i++) {
    const row = new Array<number>(n);
    for (let j = 0; j < n; j++) row[j] = rng.randInt(-100, 100);
    b.push(row);
  }
  return { n, a, b };
}

/** distinct shuffled stream of 0..n-1 (Fisher–Yates, deterministic) */
export function genDistinctShuffle(n: number, seed: number): number[] {
  const rng = new SplitMix64(seed);
  const a = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) {
    const j = rng.randInt(0, i);
    const tmp = a[i];
    a[i] = a[j];
    a[j] = tmp;
  }
  return a;
}

// ---------------------------------------------------------------------------
// Canonical input encodings
// ---------------------------------------------------------------------------

const j = (xs: ArrayLike<number>) => Array.from(xs).join(",");

export function canonicalInput(dataset: DatasetType, n: number, seed: number): string {
  switch (dataset) {
    case "random_int":
      return j(genRandomInt(n, seed));
    case "sorted":
      return j(genSorted(n, seed));
    case "reverse_sorted":
      return j(genReverseSorted(n, seed));
    case "nearly_sorted":
      return j(genNearlySorted(n, seed));
    case "duplicate_heavy":
      return j(genDuplicateHeavy(n, seed));
    case "search_mixed": {
      const d = genSearchMixed(n, seed);
      return `${j(d.arr)}|${j(d.queries)}`;
    }
    case "graph_sparse": {
      const g = genGraphSparse(n, seed);
      const parts: string[] = [];
      for (let u = 0; u < g.n; u++) for (const e of g.adj[u]) parts.push(`${u}:${e.to}:${e.w}`);
      return parts.join(",");
    }
    case "text_corpus": {
      const d = genTextCorpus(n, seed);
      return `${d.corpus}|${d.pattern}`;
    }
    case "bounded_matrix": {
      const d = genBoundedMatrix(n, seed);
      return `${d.a.map(j).join(",")}|${d.b.map(j).join(",")}`;
    }
  }
}

// ---------------------------------------------------------------------------
// Reference algorithm implementations
// ---------------------------------------------------------------------------

export function refMergeSort(a: number[]): number[] {
  const out = a.slice();
  const aux = new Array<number>(out.length);
  const sortRange = (lo: number, hi: number) => {
    if (hi - lo <= 1) return;
    const mid = (lo + hi) >> 1;
    sortRange(lo, mid);
    sortRange(mid, hi);
    let i = lo;
    let l = lo;
    let r = mid;
    while (l < mid && r < hi) aux[i++] = out[l] <= out[r] ? out[l++] : out[r++];
    while (l < mid) aux[i++] = out[l++];
    while (r < hi) aux[i++] = out[r++];
    for (let k = lo; k < hi; k++) out[k] = aux[k];
  };
  sortRange(0, out.length);
  return out;
}

function insertionSortRange(a: number[], lo: number, hi: number): void {
  for (let i = lo + 1; i < hi; i++) {
    const v = a[i];
    let k = i - 1;
    while (k >= lo && a[k] > v) {
      a[k + 1] = a[k];
      k--;
    }
    a[k + 1] = v;
  }
}

export function refQuickSort(a: number[]): number[] {
  const out = a.slice();
  const sortRange = (lo: number, hi: number) => {
    while (hi - lo > 16) {
      const mid = lo + ((hi - lo) >> 1);
      // median of three -> pivot value
      let x = out[lo];
      let y = out[mid];
      let z = out[hi - 1];
      if (x > y) [x, y] = [y, x];
      if (y > z) [y, z] = [z, y];
      if (x > y) [x, y] = [y, x];
      const pivot = y;
      let i = lo;
      let k = lo;
      let j = hi;
      // three-way partition (Bentley-McIlroy style, equal keys to the middle)
      while (k < j) {
        if (out[k] < pivot) {
          const t = out[i];
          out[i] = out[k];
          out[k] = t;
          i++;
          k++;
        } else if (out[k] > pivot) {
          j--;
          const t = out[k];
          out[k] = out[j];
          out[j] = t;
        } else k++;
      }
      // recurse into smaller side first
      if (i - lo < hi - j) {
        sortRange(lo, i);
        lo = j;
      } else {
        sortRange(j, hi);
        hi = i;
      }
    }
    insertionSortRange(out, lo, hi);
  };
  sortRange(0, out.length);
  return out;
}

export function refHeapSort(a: number[]): number[] {
  const out = a.slice();
  const n = out.length;
  const siftDown = (start: number, end: number) => {
    let root = start;
    for (;;) {
      let child = 2 * root + 1;
      if (child > end) break;
      if (child + 1 <= end && out[child] < out[child + 1]) child++;
      if (out[root] < out[child]) {
        const t = out[root];
        out[root] = out[child];
        out[child] = t;
        root = child;
      } else break;
    }
  };
  for (let start = (n - 2) >> 1; start >= 0; start--) siftDown(start, n - 1);
  for (let end = n - 1; end > 0; end--) {
    const t = out[0];
    out[0] = out[end];
    out[end] = t;
    siftDown(0, end - 1);
  }
  return out;
}

export function refInsertionSort(a: number[]): number[] {
  const out = a.slice();
  insertionSortRange(out, 0, out.length);
  return out;
}

export function refLinearSearch(d: SearchData): number[] {
  const res: number[] = [];
  for (const q of d.queries) {
    let idx = -1;
    for (let i = 0; i < d.n; i++) {
      if (d.arr[i] === q) {
        idx = i;
        break;
      }
    }
    res.push(idx);
  }
  return res;
}

export function refBinarySearch(d: SearchData): number[] {
  const res: number[] = [];
  for (const q of d.queries) {
    let lo = 0;
    let hi = d.n - 1;
    let idx = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      const v = d.arr[mid];
      if (v === q) {
        idx = mid;
        break;
      }
      if (v < q) lo = mid + 1;
      else hi = mid - 1;
    }
    res.push(idx);
  }
  return res;
}

export function refHashLookup(d: SearchData): number[] {
  const map = new Map<number, number>();
  for (let i = 0; i < d.n; i++) map.set(d.arr[i], i);
  const res: number[] = [];
  for (const q of d.queries) {
    const v = map.get(q);
    res.push(v === undefined ? -1 : v);
  }
  return res;
}

/** hand-written binary min-heap (identical structure to the language engines) */
class RefMinHeap {
  private a: number[] = [];
  push(v: number): void {
    this.a.push(v);
    let i = this.a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.a[p] <= this.a[i]) break;
      const t = this.a[p];
      this.a[p] = this.a[i];
      this.a[i] = t;
      i = p;
    }
  }
  pop(): number {
    const top = this.a[0];
    const last = this.a.pop()!;
    if (this.a.length > 0) {
      this.a[0] = last;
      let i = 0;
      const n = this.a.length;
      for (;;) {
        let child = 2 * i + 1;
        if (child >= n) break;
        if (child + 1 < n && this.a[child + 1] < this.a[child]) child++;
        if (this.a[i] <= this.a[child]) break;
        const t = this.a[i];
        this.a[i] = this.a[child];
        this.a[child] = t;
        i = child;
      }
    }
    return top;
  }
  get size(): number {
    return this.a.length;
  }
}

export function refDynamicArray(stream: number[]): number[] {
  const arr: number[] = [];
  for (const v of stream) arr.push(v);
  return arr;
}

export function refQueueCycle(stream: number[]): number[] {
  const out: number[] = [];
  const q: number[] = [];
  for (const v of stream) q.push(v);
  while (q.length > 0) out.push(q.shift()!);
  return out;
}

export function refPriorityQueueCycle(stream: number[]): number[] {
  const heap = new RefMinHeap();
  for (const v of stream) heap.push(v);
  const out: number[] = [];
  while (heap.size > 0) out.push(heap.pop());
  return out;
}

export function refHashMapCycle(stream: number[]): { lookups: number[]; finalSize: number } {
  const map = new Map<number, number>();
  for (let i = 0; i < stream.length; i++) map.set(stream[i], i);
  const lookups: number[] = [];
  for (const k of stream) {
    const v = map.get(k);
    lookups.push(v === undefined ? -1 : v);
  }
  for (const k of stream) map.delete(k);
  return { lookups, finalSize: map.size };
}

export function refBFS(g: GraphData): number[] {
  const visited = new Array<boolean>(g.n).fill(false);
  const order: number[] = [];
  const queue: number[] = [0];
  visited[0] = true;
  let head = 0;
  while (head < queue.length) {
    const u = queue[head++];
    order.push(u);
    for (const e of g.adj[u]) {
      if (!visited[e.to]) {
        visited[e.to] = true;
        queue.push(e.to);
      }
    }
  }
  return order;
}

export function refDFS(g: GraphData): number[] {
  const visited = new Array<boolean>(g.n).fill(false);
  const order: number[] = [];
  const stack: number[] = [0];
  visited[0] = true;
  while (stack.length > 0) {
    const u = stack.pop()!;
    order.push(u);
    // push neighbours in reverse adjacency order so they are visited in order
    for (let i = g.adj[u].length - 1; i >= 0; i--) {
      const v = g.adj[u][i].to;
      if (!visited[v]) {
        visited[v] = true;
        stack.push(v);
      }
    }
  }
  return order;
}

export function refDijkstra(g: GraphData): number[] {
  const INF = -1;
  const dist = new Array<number>(g.n).fill(INF);
  const done = new Array<boolean>(g.n).fill(false);
  const heap = new RefMinHeap();
  // heap stores encoded (dist * 2^20 + node); distances < 2^41 stay exact.
  // The engines use the same encoding so tie behaviour matches.
  const SHIFT = 1048576; // 2^20
  dist[0] = 0;
  heap.push(0);
  while (heap.size > 0) {
    const enc = heap.pop();
    const d = Math.floor(enc / SHIFT);
    const u = enc % SHIFT;
    if (done[u]) continue;
    done[u] = true;
    for (const e of g.adj[u]) {
      const nd = d + e.w;
      if (dist[e.to] === INF || nd < dist[e.to]) {
        dist[e.to] = nd;
        heap.push(nd * SHIFT + e.to);
      }
    }
  }
  return dist;
}

export function refNaiveSearch(d: CorpusData): { count: number; offsets: number[] } {
  const offsets: number[] = [];
  const m = d.pattern.length;
  for (let i = 0; i + m <= d.n; i++) {
    let ok = true;
    for (let k = 0; k < m; k++) {
      if (d.corpus[i + k] !== d.pattern[k]) {
        ok = false;
        break;
      }
    }
    if (ok) offsets.push(i);
  }
  return { count: offsets.length, offsets };
}

export function refKMP(d: CorpusData): { count: number; offsets: number[] } {
  const m = d.pattern.length;
  const fail = new Array<number>(m).fill(0);
  let k = 0;
  for (let i = 1; i < m; i++) {
    while (k > 0 && d.pattern[i] !== d.pattern[k]) k = fail[k - 1];
    if (d.pattern[i] === d.pattern[k]) k++;
    fail[i] = k;
  }
  const offsets: number[] = [];
  k = 0;
  for (let i = 0; i < d.n; i++) {
    while (k > 0 && d.corpus[i] !== d.pattern[k]) k = fail[k - 1];
    if (d.corpus[i] === d.pattern[k]) k++;
    if (k === m) {
      offsets.push(i - m + 1);
      k = fail[k - 1];
    }
  }
  return { count: offsets.length, offsets };
}

export function refMatmul(a: number[][], b: number[][], order: "ijk" | "ikj"): number[][] {
  const n = a.length;
  const c: number[][] = Array.from({ length: n }, () => new Array<number>(n).fill(0));
  if (order === "ijk") {
    for (let i = 0; i < n; i++)
      for (let jj = 0; jj < n; jj++) {
        let s = 0;
        for (let kk = 0; kk < n; kk++) s += a[i][kk] * b[kk][jj];
        c[i][jj] = s;
      }
  } else {
    for (let i = 0; i < n; i++)
      for (let kk = 0; kk < n; kk++) {
        const aik = a[i][kk];
        for (let jj = 0; jj < n; jj++) c[i][jj] += aik * b[kk][jj];
      }
  }
  return c;
}

// ---------------------------------------------------------------------------
// Variant runner — canonical output for a (variant, dataset, size, seed)
// ---------------------------------------------------------------------------

export interface VerifyOutput {
  inputChecksumHex: string;
  outputChecksumHex: string;
}

export function runReference(variantKey: string, dataset: DatasetType, n: number, seed: number): VerifyOutput {
  const input = canonicalInput(dataset, n, seed);
  const inputChecksumHex = fnv1a64(input);
  let output = "";

  const sortInput = (): number[] => {
    switch (dataset) {
      case "random_int":
        return genRandomInt(n, seed);
      case "sorted":
        return genSorted(n, seed);
      case "reverse_sorted":
        return genReverseSorted(n, seed);
      case "nearly_sorted":
        return genNearlySorted(n, seed);
      case "duplicate_heavy":
        return genDuplicateHeavy(n, seed);
      default:
        throw new Error(`dataset ${dataset} not valid for sorting`);
    }
  };

  switch (variantKey) {
    case "sorting.merge_sort":
      output = j(refMergeSort(sortInput()));
      break;
    case "sorting.quick_sort":
      output = j(refQuickSort(sortInput()));
      break;
    case "sorting.heap_sort":
      output = j(refHeapSort(sortInput()));
      break;
    case "sorting.insertion_sort":
      output = j(refInsertionSort(sortInput()));
      break;
    case "sorting.std_sort":
      output = j(sortInput().sort((x, y) => x - y));
      break;
    case "search.linear_search":
      output = j(refLinearSearch(genSearchMixed(n, seed)));
      break;
    case "search.binary_search":
      output = j(refBinarySearch(genSearchMixed(n, seed)));
      break;
    case "search.hash_lookup":
      output = j(refHashLookup(genSearchMixed(n, seed)));
      break;
    case "datastructures.dynamic_array":
      output = j(refDynamicArray(genRandomInt(n, seed)));
      break;
    case "datastructures.queue_ops":
      output = j(refQueueCycle(genRandomInt(n, seed)));
      break;
    case "datastructures.priority_queue_ops":
      output = j(refPriorityQueueCycle(genDistinctShuffle(n, seed)));
      break;
    case "datastructures.pq_std":
      output = j(refPriorityQueueCycle(genDistinctShuffle(n, seed)));
      break;
    case "datastructures.hash_map_ops": {
      const r = refHashMapCycle(genDistinctShuffle(n, seed));
      output = `${j(r.lookups)}|${r.finalSize}`;
      break;
    }
    case "graphs.bfs":
      output = j(refBFS(genGraphSparse(n, seed)));
      break;
    case "graphs.dfs":
      output = j(refDFS(genGraphSparse(n, seed)));
      break;
    case "graphs.dijkstra":
      output = j(refDijkstra(genGraphSparse(n, seed)));
      break;
    case "strings.naive_search": {
      const r = refNaiveSearch(genTextCorpus(n, seed));
      output = `${r.count}|${j(r.offsets)}`;
      break;
    }
    case "strings.kmp": {
      const r = refKMP(genTextCorpus(n, seed));
      output = `${r.count}|${j(r.offsets)}`;
      break;
    }
    case "matrix.matmul_naive": {
      const d = genBoundedMatrix(n, seed);
      output = refMatmul(d.a, d.b, "ijk")
        .map(j)
        .join(",");
      break;
    }
    case "matrix.matmul_ikj": {
      const d = genBoundedMatrix(n, seed);
      output = refMatmul(d.a, d.b, "ikj")
        .map(j)
        .join(",");
      break;
    }
    default:
      throw new Error(`unknown variant ${variantKey}`);
  }

  return { inputChecksumHex, outputChecksumHex: fnv1a64(output) };
}

// ---------------------------------------------------------------------------
// Fixed verification cases (executed identically by every language runner)
// ---------------------------------------------------------------------------

export const VERIFY_SEED = 0xc0debEEf;

export interface VerifyCase {
  key: string; // "<dataset>:<n>"
  dataset: DatasetType;
  n: number;
}

export function verifyCasesFor(variantKey: string): VerifyCase[] {
  const algo = variantKey.split(".")[0];
  switch (algo) {
    case "sorting":
      return (["random_int", "sorted", "reverse_sorted", "nearly_sorted", "duplicate_heavy"] as DatasetType[]).map(
        (d) => ({ key: `${d}:257`, dataset: d, n: 257 })
      );
    case "search":
      return [{ key: `search_mixed:257`, dataset: "search_mixed" as DatasetType, n: 257 }];
    case "datastructures":
      return [{ key: `random_int:257`, dataset: "random_int" as DatasetType, n: 257 }];
    case "graphs":
      return [{ key: `graph_sparse:61`, dataset: "graph_sparse" as DatasetType, n: 61 }];
    case "strings":
      return [{ key: `text_corpus:1000`, dataset: "text_corpus" as DatasetType, n: 1000 }];
    case "matrix":
      return [{ key: `bounded_matrix:9`, dataset: "bounded_matrix" as DatasetType, n: 9 }];
    default:
      throw new Error(`unknown algorithm ${algo}`);
  }
}

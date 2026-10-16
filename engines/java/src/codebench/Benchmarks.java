// CodeBench — JMH benchmarks (Java harness)
//
// One JMH run measures one variant, selected via the benchmark filter regex
// `^codebench\.Benchmarks\.<method>$`. The job parameters arrive through
// environment variables (CB_VARIANT/CB_DATASET/CB_SIZE/CB_SEED) because JMH
// forks a fresh JVM and env is inherited; the coordinator records the full
// parameter set in the result metadata.
//
// Warm-up iterations, measured iterations and fork count are JMH command-line
// options (-wi/-i/-w/-r/-f) chosen by the coordinator.
//
// The gc profiler (-prof gc) provides allocation-rate measurements as a
// Java-specific secondary metric; it is labelled as such and never compared
// against C++/Python numbers.
//
// Copyright © 2026 Parsa Fathi — Apache-2.0 (see LICENSE)

package codebench;

import org.openjdk.jmh.annotations.*;
import org.openjdk.jmh.infra.Blackhole;

import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashMap;
import java.util.PriorityQueue;
import java.util.concurrent.TimeUnit;

@State(Scope.Benchmark)
@BenchmarkMode(Mode.AverageTime)
@OutputTimeUnit(TimeUnit.NANOSECONDS)
public class Benchmarks {

    // ---- job configuration (env) ----
    static final String VARIANT = env("CB_VARIANT", "merge_sort");
    static final String DATASET = env("CB_DATASET", "random_int");
    static final int SIZE = Integer.parseInt(env("CB_SIZE", "10000"));
    static final long SEED = Long.parseUnsignedLong(env("CB_SEED", "1"));

    static String env(String k, String dflt) {
        String v = System.getenv(k);
        return v == null ? dflt : v;
    }

    // ---- workload (built once per trial, pristine; ops copy/reset as needed) ----
    int[] sortInput;
    Algorithms.SearchData search;
    HashMap<Long, Long> hashMap;
    int[] stream;
    int[] distinctStream;
    Algorithms.Graph graph;
    Algorithms.Corpus corpus;
    Algorithms.Matrix matrix;
    long[] matrixOut;

    int queryIdx = 0;

    @Setup(Level.Trial)
    public void setup() {
        switch (Algorithms.familyOf(VARIANT)) {
            case "sorting":
                sortInput = Algorithms.makeSortInput(DATASET, SIZE, SEED);
                break;
            case "search":
                search = Algorithms.genSearchMixed(SIZE, SEED);
                if (VARIANT.equals("hash_lookup")) {
                    hashMap = new HashMap<>(search.n * 2);
                    for (int i = 0; i < search.n; i++) hashMap.put(search.arr[i], (long) i);
                }
                break;
            case "datastructures":
                if (VARIANT.equals("dynamic_array") || VARIANT.equals("queue_ops"))
                    stream = Algorithms.genRandomInt(SIZE, SEED);
                else
                    distinctStream = Algorithms.genDistinctShuffle(SIZE, SEED);
                break;
            case "graphs":
                graph = Algorithms.genGraphSparse(SIZE, SEED);
                break;
            case "strings":
                corpus = Algorithms.genTextCorpus(SIZE, SEED);
                break;
            case "matrix":
                matrix = Algorithms.genBoundedMatrix(SIZE, SEED);
                matrixOut = new long[SIZE * SIZE];
                break;
            default:
                throw new IllegalStateException("unknown variant " + VARIANT);
        }
    }

    // ------------------------------------------------------------------
    // Sorting — the defensive copy is part of the measured op (the sort is
    // destructive) and is identical across all languages.
    // ------------------------------------------------------------------
    @Benchmark
    public void mergeSort(Blackhole bh) {
        int[] buf = sortInput.clone();
        Algorithms.mergeSort(buf);
        bh.consume(buf[0]);
        bh.consume(buf[buf.length - 1]);
    }

    @Benchmark
    public void quickSort(Blackhole bh) {
        int[] buf = sortInput.clone();
        Algorithms.quickSort(buf);
        bh.consume(buf[0]);
        bh.consume(buf[buf.length - 1]);
    }

    @Benchmark
    public void heapSort(Blackhole bh) {
        int[] buf = sortInput.clone();
        Algorithms.heapSort(buf);
        bh.consume(buf[0]);
        bh.consume(buf[buf.length - 1]);
    }

    @Benchmark
    public void insertionSort(Blackhole bh) {
        int[] buf = sortInput.clone();
        Algorithms.insertionSortRange(buf, 0, buf.length);
        bh.consume(buf[0]);
        bh.consume(buf[buf.length - 1]);
    }

    @Benchmark
    public void stdSort(Blackhole bh) {
        int[] buf = sortInput.clone();
        Arrays.sort(buf);
        bh.consume(buf[0]);
        bh.consume(buf[buf.length - 1]);
    }

    // ------------------------------------------------------------------
    // Search — one query per op, cycling the deterministic query set
    // ------------------------------------------------------------------
    @Benchmark
    public void linearSearch(Blackhole bh) {
        long q = search.queries[queryIdx % search.n];
        queryIdx++;
        long r = -1;
        for (int i = 0; i < search.n; i++)
            if (search.arr[i] == q) { r = i; break; }
        bh.consume(r);
    }

    @Benchmark
    public void binarySearch(Blackhole bh) {
        long q = search.queries[queryIdx % search.n];
        queryIdx++;
        int lo = 0, hi = search.n - 1;
        long r = -1;
        while (lo <= hi) {
            int mid = lo + (hi - lo) / 2;
            if (search.arr[mid] == q) { r = mid; break; }
            if (search.arr[mid] < q) lo = mid + 1;
            else hi = mid - 1;
        }
        bh.consume(r);
    }

    @Benchmark
    public void hashLookup(Blackhole bh) {
        long q = search.queries[queryIdx % search.n];
        queryIdx++;
        Long v = hashMap.get(q); // boxed Long keys: idiomatic cost, documented
        bh.consume(v == null ? -1L : v);
    }

    // ------------------------------------------------------------------
    // Data structures — one full structure cycle per op
    // ------------------------------------------------------------------
    @Benchmark
    public void dynamicArray(Blackhole bh) {
        ArrayList<Integer> v = new ArrayList<>(0); // fresh container: growth is measured
        for (int x : stream) v.add(x);
        bh.consume(v.size());
        bh.consume(v.get(v.size() - 1));
    }

    @Benchmark
    public void queueOps(Blackhole bh) {
        ArrayDeque<Integer> q = new ArrayDeque<>(0);
        for (int x : stream) q.add(x);
        long acc = 0;
        while (!q.isEmpty()) acc += q.poll();
        bh.consume(acc);
    }

    @Benchmark
    public void priorityQueueOps(Blackhole bh) {
        Algorithms.MinHeapLong heap = new Algorithms.MinHeapLong();
        for (int x : distinctStream) heap.push(x);
        long acc = 0;
        while (!heap.isEmpty()) acc += heap.pop();
        bh.consume(acc);
    }

    @Benchmark
    public void pqStd(Blackhole bh) {
        PriorityQueue<Integer> pq = new PriorityQueue<>();
        for (int x : distinctStream) pq.add(x);
        long acc = 0;
        while (!pq.isEmpty()) acc += pq.poll();
        bh.consume(acc);
    }

    @Benchmark
    public void hashMapOps(Blackhole bh) {
        HashMap<Long, Long> m = new HashMap<>(distinctStream.length * 2);
        for (int i = 0; i < distinctStream.length; i++)
            m.put((long) distinctStream[i], (long) i);
        long acc = 0;
        for (int k : distinctStream) {
            Long v = m.get((long) k);
            acc += (v == null ? -1 : v);
        }
        for (int k : distinctStream) m.remove((long) k);
        bh.consume(acc + m.size());
    }

    // ------------------------------------------------------------------
    // Graphs — visited reset is part of the measured op (documented)
    // ------------------------------------------------------------------
    @Benchmark
    public void bfs(Blackhole bh) {
        int n = graph.n;
        boolean[] visited = new boolean[n];
        ArrayDeque<Integer> q = new ArrayDeque<>();
        q.add(0);
        visited[0] = true;
        long acc = 0;
        while (!q.isEmpty()) {
            int u = q.poll();
            acc += u;
            int[] to = graph.adjTo[u];
            for (int k = 0; k < 6; k++) {
                int v2 = to[k];
                if (!visited[v2]) {
                    visited[v2] = true;
                    q.add(v2);
                }
            }
        }
        bh.consume(acc);
    }

    @Benchmark
    public void dfs(Blackhole bh) {
        int n = graph.n;
        boolean[] visited = new boolean[n];
        int[] st = new int[n];
        int sp = 0;
        st[sp++] = 0;
        visited[0] = true;
        long acc = 0;
        while (sp > 0) {
            int u = st[--sp];
            acc += u;
            int[] to = graph.adjTo[u];
            for (int k = 5; k >= 0; k--) {
                int v2 = to[k];
                if (!visited[v2]) {
                    visited[v2] = true;
                    st[sp++] = v2;
                }
            }
        }
        bh.consume(acc);
    }

    @Benchmark
    public void dijkstra(Blackhole bh) {
        final long SHIFT = 1048576L; // 2^20 — matches all engines
        int n = graph.n;
        long[] dist = new long[n];
        boolean[] done = new boolean[n];
        Arrays.fill(dist, -1L);
        Algorithms.MinHeapLong heap = new Algorithms.MinHeapLong();
        dist[0] = 0;
        heap.push(0);
        while (!heap.isEmpty()) {
            long enc = heap.pop();
            long d = enc / SHIFT;
            int u = (int) (enc % SHIFT);
            if (done[u]) continue;
            done[u] = true;
            int[] to = graph.adjTo[u];
            int[] w = graph.adjW[u];
            for (int k = 0; k < 6; k++) {
                int t2 = to[k];
                long nd = d + w[k];
                if (dist[t2] == -1L || nd < dist[t2]) {
                    dist[t2] = nd;
                    heap.push(nd * SHIFT + t2);
                }
            }
        }
        long acc = 0;
        for (int i = 0; i < n; i++) acc += dist[i];
        bh.consume(acc);
    }

    // ------------------------------------------------------------------
    // Strings — one full corpus scan per op
    // ------------------------------------------------------------------
    @Benchmark
    public void naiveSearch(Blackhole bh) {
        char[] text = corpus.text;
        char[] pat = corpus.pattern;
        int m = pat.length;
        long acc = 0;
        for (int i = 0; i + m <= corpus.n; i++) {
            boolean ok = true;
            for (int k = 0; k < m; k++)
                if (text[i + k] != pat[k]) { ok = false; break; }
            if (ok) acc += i;
        }
        bh.consume(acc);
    }

    @Benchmark
    public void kmp(Blackhole bh) {
        char[] text = corpus.text;
        char[] pat = corpus.pattern;
        int m = pat.length;
        int[] fail = new int[m];
        int k = 0;
        for (int i = 1; i < m; i++) {
            while (k > 0 && pat[i] != pat[k]) k = fail[k - 1];
            if (pat[i] == pat[k]) k++;
            fail[i] = k;
        }
        k = 0;
        long acc = 0;
        for (int i = 0; i < corpus.n; i++) {
            while (k > 0 && text[i] != pat[k]) k = fail[k - 1];
            if (text[i] == pat[k]) k++;
            if (k == m) {
                acc += i - m + 1;
                k = fail[k - 1];
            }
        }
        bh.consume(acc);
    }

    // ------------------------------------------------------------------
    // Matrix — C is pre-allocated; every element is rewritten per op
    // ------------------------------------------------------------------
    @Benchmark
    public void matmulNaive(Blackhole bh) {
        int n = matrix.n;
        int[] a = matrix.a;
        int[] b = matrix.b;
        long[] c = matrixOut;
        Arrays.fill(c, 0L); // reset included in the measured op — identical contract in all languages
        for (int i = 0; i < n; i++)
            for (int jj = 0; jj < n; jj++) {
                long s = 0;
                for (int kk = 0; kk < n; kk++) s += (long) a[i * n + kk] * b[kk * n + jj];
                c[i * n + jj] = s;
            }
        bh.consume(c[0]);
    }

    @Benchmark
    public void matmulIkj(Blackhole bh) {
        int n = matrix.n;
        int[] a = matrix.a;
        int[] b = matrix.b;
        long[] c = matrixOut;
        Arrays.fill(c, 0L); // reset included in the measured op — identical contract in all languages
        for (int i = 0; i < n; i++)
            for (int kk = 0; kk < n; kk++) {
                long aik = a[i * n + kk];
                for (int jj = 0; jj < n; jj++) c[i * n + jj] += aik * b[kk * n + jj];
            }
        bh.consume(c[0]);
    }
}

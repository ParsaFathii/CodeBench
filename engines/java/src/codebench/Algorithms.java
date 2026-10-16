// CodeBench — Java algorithms, datasets and verification (shared by the JMH
// benchmarks and the standalone verifier).
//
// SplitMix64, FNV-1a 64 and every dataset generator are bit-identical to the
// C++/Python/TypeScript implementations, which is what makes cross-language
// comparisons run on logically identical inputs.
//
// Copyright © 2026 Parsa Fathi — Apache-2.0 (see LICENSE)

package codebench;

import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.ArrayDeque;
import java.util.Arrays;
import java.util.HashMap;
import java.util.PriorityQueue;

public final class Algorithms {

    private Algorithms() {}

    // -----------------------------------------------------------------------
    // SplitMix64
    // -----------------------------------------------------------------------
    public static final class SplitMix64 {
        private long state;

        public SplitMix64(long seed) {
            this.state = mix(seed + 0x9E3779B97F4A7C15L);
        }

        private static long mix(long z) {
            z = (z ^ (z >>> 30)) * 0xBF58476D1CE4E5B9L;
            z = (z ^ (z >>> 27)) * 0x94D049BB133111EBL;
            return z ^ (z >>> 31);
        }

        public long next() {
            state += 0x9E3779B97F4A7C15L;
            return mix(state);
        }

        public long randInt(long lo, long hi) {
            long range = hi - lo + 1;
            return lo + Long.remainderUnsigned(next(), range);
        }
    }

    // -----------------------------------------------------------------------
    // FNV-1a 64 (hex, 16 chars)
    // -----------------------------------------------------------------------
    public static String fnv1aHex(String s) {
        long h = 0xcbf29ce484222325L;
        for (byte b : s.getBytes(StandardCharsets.UTF_8)) {
            h ^= (b & 0xffL);
            h *= 0x100000001b3L;
        }
        String hex = Long.toUnsignedString(h, 16);
        StringBuilder sb = new StringBuilder(16);
        for (int i = hex.length(); i < 16; i++) sb.append('0');
        return sb.append(hex).toString();
    }

    // -----------------------------------------------------------------------
    // Datasets
    // -----------------------------------------------------------------------
    public static int[] genRandomInt(int n, long seed) {
        SplitMix64 rng = new SplitMix64(seed);
        int[] out = new int[n];
        for (int i = 0; i < n; i++) out[i] = (int) rng.randInt(-2147483648L, 2147483647L);
        return out;
    }

    public static int[] genSorted(int n, long seed) {
        SplitMix64 rng = new SplitMix64(seed);
        int[] out = new int[n];
        long v = rng.randInt(0, 1000);
        for (int i = 0; i < n; i++) {
            out[i] = (int) v;
            v += rng.randInt(0, 100);
        }
        return out;
    }

    public static int[] genReverseSorted(int n, long seed) {
        SplitMix64 rng = new SplitMix64(seed);
        int[] out = new int[n];
        long v = rng.randInt(0, 1000);
        for (int i = 0; i < n; i++) {
            out[i] = (int) v;
            v -= rng.randInt(0, 100);
        }
        return out;
    }

    public static int[] genNearlySorted(int n, long seed) {
        SplitMix64 rng = new SplitMix64(seed); // one continuous stream
        int[] out = new int[n];
        long v = rng.randInt(0, 1000);
        for (int i = 0; i < n; i++) {
            out[i] = (int) v;
            v += rng.randInt(0, 100);
        }
        int k = Math.max(1, n / 100);
        for (int s = 0; s < k; s++) {
            int i = (int) rng.randInt(0, n - 2);
            int j = i + (int) rng.randInt(1, 50);
            if (j >= n) j = n - 1;
            int t = out[i];
            out[i] = out[j];
            out[j] = t;
        }
        return out;
    }

    public static int[] genDuplicateHeavy(int n, long seed) {
        SplitMix64 rng = new SplitMix64(seed);
        int[] out = new int[n];
        for (int i = 0; i < n; i++) out[i] = (int) rng.randInt(-50, 50);
        return out;
    }

    public static final class SearchData {
        public int n;
        public long[] arr;
        public long[] queries;
    }

    public static SearchData genSearchMixed(int n, long seed) {
        SplitMix64 rng = new SplitMix64(seed);
        SearchData d = new SearchData();
        d.n = n;
        d.arr = new long[n];
        for (int i = 0; i < n; i++) d.arr[i] = 2L * i;
        d.queries = new long[n];
        for (int j = 0; j < n; j++) {
            if (j % 2 == 0) d.queries[j] = d.arr[(int) rng.randInt(0, n - 1)];
            else d.queries[j] = d.arr[(int) rng.randInt(0, n - 1)] + 1; // odd -> miss
        }
        return d;
    }

    public static final class Graph {
        public int n;
        public int[][] adjTo;
        public int[][] adjW;
    }

    public static Graph genGraphSparse(int n, long seed) {
        SplitMix64 rng = new SplitMix64(seed);
        Graph g = new Graph();
        g.n = n;
        int[][] to = new int[n][6];
        int[][] w = new int[n][6];
        for (int u = 0; u < n; u++) {
            for (int k = 0; k < 6; k++) {
                to[u][k] = (int) rng.randInt(0, n - 1);
                w[u][k] = (int) rng.randInt(1, 1000);
            }
        }
        g.adjTo = to;
        g.adjW = w;
        return g;
    }

    public static final class Corpus {
        public int n;
        public char[] text;
        public char[] pattern; // length 32
    }

    public static Corpus genTextCorpus(int n, long seed) {
        SplitMix64 rng = new SplitMix64(seed);
        char[] alpha = {'A', 'C', 'G', 'T'};
        Corpus c = new Corpus();
        c.n = n;
        c.pattern = new char[32];
        for (int i = 0; i < 32; i++) c.pattern[i] = alpha[(int) rng.randInt(0, 3)];
        c.text = new char[n];
        for (int i = 0; i < n; i++) c.text[i] = alpha[(int) rng.randInt(0, 3)];
        int pos = n / 2;
        System.arraycopy(c.pattern, 0, c.text, pos, 32);
        return c;
    }

    public static final class Matrix {
        public int n;
        public int[] a, b; // row-major
    }

    public static Matrix genBoundedMatrix(int n, long seed) {
        SplitMix64 rng = new SplitMix64(seed);
        Matrix m = new Matrix();
        m.n = n;
        m.a = new int[n * n];
        for (int i = 0; i < n * n; i++) m.a[i] = (int) rng.randInt(-100, 100);
        m.b = new int[n * n];
        for (int i = 0; i < n * n; i++) m.b[i] = (int) rng.randInt(-100, 100);
        return m;
    }

    public static int[] genDistinctShuffle(int n, long seed) {
        SplitMix64 rng = new SplitMix64(seed);
        int[] a = new int[n];
        for (int i = 0; i < n; i++) a[i] = i;
        for (int i = n - 1; i > 0; i--) {
            int j = (int) rng.randInt(0, i);
            int t = a[i];
            a[i] = a[j];
            a[j] = t;
        }
        return a;
    }

    // -----------------------------------------------------------------------
    // Canonical encodings
    // -----------------------------------------------------------------------
    public static String joinInts(int[] v) {
        StringBuilder sb = new StringBuilder(v.length * 5);
        for (int i = 0; i < v.length; i++) {
            if (i > 0) sb.append(',');
            sb.append(v[i]);
        }
        return sb.toString();
    }

    public static String joinLongs(long[] v) {
        StringBuilder sb = new StringBuilder(v.length * 6);
        for (int i = 0; i < v.length; i++) {
            if (i > 0) sb.append(',');
            sb.append(v[i]);
        }
        return sb.toString();
    }

    public static int[] makeSortInput(String dataset, int n, long seed) {
        switch (dataset) {
            case "sorted": return genSorted(n, seed);
            case "reverse_sorted": return genReverseSorted(n, seed);
            case "nearly_sorted": return genNearlySorted(n, seed);
            case "duplicate_heavy": return genDuplicateHeavy(n, seed);
            default: return genRandomInt(n, seed);
        }
    }

    public static String canonicalInputFor(String dataset, int n, long seed) {
        switch (dataset) {
            case "random_int": return joinInts(genRandomInt(n, seed));
            case "sorted": return joinInts(genSorted(n, seed));
            case "reverse_sorted": return joinInts(genReverseSorted(n, seed));
            case "nearly_sorted": return joinInts(genNearlySorted(n, seed));
            case "duplicate_heavy": return joinInts(genDuplicateHeavy(n, seed));
            case "search_mixed": {
                SearchData d = genSearchMixed(n, seed);
                return joinLongs(d.arr) + "|" + joinLongs(d.queries);
            }
            case "graph_sparse": {
                Graph g = genGraphSparse(n, seed);
                StringBuilder sb = new StringBuilder();
                for (int u = 0; u < g.n; u++)
                    for (int k = 0; k < 6; k++) {
                        if (sb.length() > 0) sb.append(',');
                        sb.append(u).append(':').append(g.adjTo[u][k]).append(':').append(g.adjW[u][k]);
                    }
                return sb.toString();
            }
            case "text_corpus": {
                Corpus c = genTextCorpus(n, seed);
                return new String(c.text) + "|" + new String(c.pattern);
            }
            case "bounded_matrix": {
                Matrix m = genBoundedMatrix(n, seed);
                return joinInts(m.a) + "|" + joinInts(m.b);
            }
            default: return "";
        }
    }

    // -----------------------------------------------------------------------
    // Hand-written binary min-heap over long[] with doubling growth
    // -----------------------------------------------------------------------
    public static final class MinHeapLong {
        private long[] a = new long[16];
        private int size = 0;

        public void push(long v) {
            if (size == a.length) a = Arrays.copyOf(a, a.length * 2);
            a[size] = v;
            int i = size++;
            while (i > 0) {
                int p = (i - 1) >>> 1;
                if (a[p] <= a[i]) break;
                long t = a[p];
                a[p] = a[i];
                a[i] = t;
                i = p;
            }
        }

        public long pop() {
            long top = a[0];
            a[0] = a[--size];
            int i = 0;
            while (true) {
                int c = 2 * i + 1;
                if (c >= size) break;
                if (c + 1 < size && a[c + 1] < a[c]) c++;
                if (a[i] <= a[c]) break;
                long t = a[i];
                a[i] = a[c];
                a[c] = t;
                i = c;
            }
            return top;
        }

        public boolean isEmpty() {
            return size == 0;
        }
    }

    // -----------------------------------------------------------------------
    // Sorting algorithms (hand-written, same structure as the other engines)
    // -----------------------------------------------------------------------
    public static void insertionSortRange(int[] a, int lo, int hi) {
        for (int i = lo + 1; i < hi; i++) {
            int v = a[i];
            int k = i - 1;
            while (k >= lo && a[k] > v) {
                a[k + 1] = a[k];
                k--;
            }
            a[k + 1] = v;
        }
    }

    public static void mergeSort(int[] a) {
        int n = a.length;
        int[] aux = new int[n];
        mergeSortRec(a, aux, 0, n);
    }

    private static void mergeSortRec(int[] a, int[] aux, int lo, int hi) {
        if (hi - lo <= 1) return;
        int mid = lo + (hi - lo) / 2;
        mergeSortRec(a, aux, lo, mid);
        mergeSortRec(a, aux, mid, hi);
        int i = lo, l = lo, r = mid;
        while (l < mid && r < hi) aux[i++] = (a[l] <= a[r]) ? a[l++] : a[r++];
        while (l < mid) aux[i++] = a[l++];
        while (r < hi) aux[i++] = a[r++];
        for (int k = lo; k < hi; k++) a[k] = aux[k];
    }

    public static void quickSort(int[] a) {
        quickSortRec(a, 0, a.length);
    }

    private static void quickSortRec(int[] a, int lo, int hi) {
        while (hi - lo > 16) {
            int mid = lo + (hi - lo) / 2;
            int x = a[lo], y = a[mid], z = a[hi - 1];
            if (x > y) { int t = x; x = y; y = t; }
            if (y > z) { int t = y; y = z; z = t; }
            if (x > y) { int t = x; x = y; y = t; }
            int pivot = y;
            int i = lo, k = lo, j = hi;
            while (k < j) {
                if (a[k] < pivot) {
                    int t = a[i];
                    a[i] = a[k];
                    a[k] = t;
                    i++;
                    k++;
                } else if (a[k] > pivot) {
                    j--;
                    int t = a[k];
                    a[k] = a[j];
                    a[j] = t;
                } else k++;
            }
            if (i - lo < hi - j) {
                quickSortRec(a, lo, i);
                lo = j;
            } else {
                quickSortRec(a, j, hi);
                hi = i;
            }
        }
        insertionSortRange(a, lo, hi);
    }

    public static void heapSort(int[] a) {
        int n = a.length;
        for (int start = (n - 2) / 2; start >= 0; start--) siftDown(a, start, n - 1);
        for (int end = n - 1; end > 0; end--) {
            int t = a[0];
            a[0] = a[end];
            a[end] = t;
            siftDown(a, 0, end - 1);
        }
    }

    private static void siftDown(int[] a, int start, int end) {
        int root = start;
        for (;;) {
            int c = 2 * root + 1;
            if (c > end) break;
            if (c + 1 <= end && a[c] < a[c + 1]) c++;
            if (a[root] < a[c]) {
                int t = a[root];
                a[root] = a[c];
                a[c] = t;
                root = c;
            } else break;
        }
    }

    // -----------------------------------------------------------------------
    // Canonical verification output for one (variant, dataset, size, seed)
    // -----------------------------------------------------------------------
    public static String verifyOutput(String variant, String dataset, int n, long seed) {
        switch (variant) {
            case "merge_sort": {
                int[] b = makeSortInput(dataset, n, seed);
                mergeSort(b);
                return joinInts(b);
            }
            case "quick_sort": {
                int[] b = makeSortInput(dataset, n, seed);
                quickSort(b);
                return joinInts(b);
            }
            case "heap_sort": {
                int[] b = makeSortInput(dataset, n, seed);
                heapSort(b);
                return joinInts(b);
            }
            case "insertion_sort": {
                int[] b = makeSortInput(dataset, n, seed);
                insertionSortRange(b, 0, b.length);
                return joinInts(b);
            }
            case "std_sort": {
                int[] b = makeSortInput(dataset, n, seed);
                Arrays.sort(b);
                return joinInts(b);
            }
            case "linear_search":
            case "binary_search":
            case "hash_lookup": {
                SearchData d = genSearchMixed(n, seed);
                HashMap<Long, Long> m = null;
                if (variant.equals("hash_lookup")) {
                    m = new HashMap<>(n * 2);
                    for (int i = 0; i < n; i++) m.put(d.arr[i], (long) i);
                }
                StringBuilder sb = new StringBuilder(n * 4);
                for (int j = 0; j < n; j++) {
                    if (j > 0) sb.append(',');
                    long q = d.queries[j];
                    long r = -1;
                    if (variant.equals("linear_search")) {
                        for (int i = 0; i < n; i++)
                            if (d.arr[i] == q) { r = i; break; }
                    } else if (variant.equals("binary_search")) {
                        int lo = 0, hi = n - 1;
                        while (lo <= hi) {
                            int mid = lo + (hi - lo) / 2;
                            if (d.arr[mid] == q) { r = mid; break; }
                            if (d.arr[mid] < q) lo = mid + 1;
                            else hi = mid - 1;
                        }
                    } else {
                        Long v = m.get(q);
                        r = v == null ? -1 : v;
                    }
                    sb.append(r);
                }
                return sb.toString();
            }
            case "dynamic_array": {
                int[] s = genRandomInt(n, seed);
                ArrayList<Integer> v = new ArrayList<>(0);
                for (int x : s) v.add(x);
                StringBuilder sb = new StringBuilder(n * 5);
                for (int i = 0; i < v.size(); i++) {
                    if (i > 0) sb.append(',');
                    sb.append(v.get(i));
                }
                return sb.toString();
            }
            case "queue_ops": {
                int[] s = genRandomInt(n, seed);
                ArrayDeque<Integer> q = new ArrayDeque<>(0);
                for (int x : s) q.add(x);
                StringBuilder sb = new StringBuilder(n * 5);
                boolean first = true;
                while (!q.isEmpty()) {
                    if (!first) sb.append(',');
                    first = false;
                    sb.append(q.poll());
                }
                return sb.toString();
            }
            case "priority_queue_ops": {
                int[] s = genDistinctShuffle(n, seed);
                MinHeapLong heap = new MinHeapLong();
                for (int x : s) heap.push(x);
                StringBuilder sb = new StringBuilder(n * 5);
                boolean first = true;
                while (!heap.isEmpty()) {
                    if (!first) sb.append(',');
                    first = false;
                    sb.append(heap.pop());
                }
                return sb.toString();
            }
            case "pq_std": {
                int[] s = genDistinctShuffle(n, seed);
                PriorityQueue<Integer> pq = new PriorityQueue<>();
                for (int x : s) pq.add(x);
                StringBuilder sb = new StringBuilder(n * 5);
                boolean first = true;
                while (!pq.isEmpty()) {
                    if (!first) sb.append(',');
                    first = false;
                    sb.append(pq.poll());
                }
                return sb.toString();
            }
            case "hash_map_ops": {
                int[] s = genDistinctShuffle(n, seed);
                HashMap<Long, Long> m = new HashMap<>(s.length * 2);
                for (int i = 0; i < s.length; i++) m.put((long) s[i], (long) i);
                StringBuilder sb = new StringBuilder(s.length * 5);
                for (int j = 0; j < s.length; j++) {
                    if (j > 0) sb.append(',');
                    sb.append(m.get((long) s[j]));
                }
                for (int k : s) m.remove((long) k);
                sb.append('|').append(m.size());
                return sb.toString();
            }
            case "bfs":
            case "dfs": {
                Graph g = genGraphSparse(n, seed);
                boolean[] visited = new boolean[n];
                StringBuilder sb = new StringBuilder(n * 4);
                if (variant.equals("bfs")) {
                    ArrayDeque<Integer> q = new ArrayDeque<>();
                    q.add(0);
                    visited[0] = true;
                    boolean first = true;
                    while (!q.isEmpty()) {
                        int u = q.poll();
                        if (!first) sb.append(',');
                        first = false;
                        sb.append(u);
                        for (int k = 0; k < 6; k++) {
                            int v2 = g.adjTo[u][k];
                            if (!visited[v2]) {
                                visited[v2] = true;
                                q.add(v2);
                            }
                        }
                    }
                } else {
                    int[] st = new int[n];
                    int sp = 0;
                    st[sp++] = 0;
                    visited[0] = true;
                    boolean first = true;
                    while (sp > 0) {
                        int u = st[--sp];
                        if (!first) sb.append(',');
                        first = false;
                        sb.append(u);
                        for (int k = 5; k >= 0; k--) {
                            int v2 = g.adjTo[u][k];
                            if (!visited[v2]) {
                                visited[v2] = true;
                                st[sp++] = v2;
                            }
                        }
                    }
                }
                return sb.toString();
            }
            case "dijkstra": {
                final long SHIFT = 1048576L; // 2^20 — matches all engines
                Graph g = genGraphSparse(n, seed);
                long[] dist = new long[n];
                boolean[] done = new boolean[n];
                Arrays.fill(dist, -1L);
                MinHeapLong heap = new MinHeapLong();
                dist[0] = 0;
                heap.push(0);
                while (!heap.isEmpty()) {
                    long enc = heap.pop();
                    long d = enc / SHIFT;
                    int u = (int) (enc % SHIFT);
                    if (done[u]) continue;
                    done[u] = true;
                    for (int k = 0; k < 6; k++) {
                        int to = g.adjTo[u][k];
                        long nd = d + g.adjW[u][k];
                        if (dist[to] == -1L || nd < dist[to]) {
                            dist[to] = nd;
                            heap.push(nd * SHIFT + to);
                        }
                    }
                }
                return joinLongs(dist);
            }
            case "naive_search":
            case "kmp": {
                Corpus c = genTextCorpus(n, seed);
                int m = c.pattern.length;
                StringBuilder sb = new StringBuilder();
                if (variant.equals("naive_search")) {
                    int count = 0;
                    for (int i = 0; i + m <= c.n; i++) {
                        boolean ok = true;
                        for (int k = 0; k < m; k++)
                            if (c.text[i + k] != c.pattern[k]) { ok = false; break; }
                        if (ok) {
                            if (count > 0) sb.append(',');
                            sb.append(i);
                            count++;
                        }
                    }
                    return count + "|" + sb;
                } else {
                    int[] fail = new int[m];
                    int k = 0;
                    for (int i = 1; i < m; i++) {
                        while (k > 0 && c.pattern[i] != c.pattern[k]) k = fail[k - 1];
                        if (c.pattern[i] == c.pattern[k]) k++;
                        fail[i] = k;
                    }
                    int count = 0;
                    k = 0;
                    for (int i = 0; i < c.n; i++) {
                        while (k > 0 && c.text[i] != c.pattern[k]) k = fail[k - 1];
                        if (c.text[i] == c.pattern[k]) k++;
                        if (k == m) {
                            if (count > 0) sb.append(',');
                            sb.append(i - m + 1);
                            count++;
                            k = fail[k - 1];
                        }
                    }
                    return count + "|" + sb;
                }
            }
            case "matmul_naive":
            case "matmul_ikj": {
                Matrix mm = genBoundedMatrix(n, seed);
                long[] c = new long[n * n];
                for (int i = 0; i < n; i++)
                    for (int jj = 0; jj < n; jj++) {
                        long s = 0;
                        if (variant.equals("matmul_naive")) {
                            for (int kk = 0; kk < n; kk++) s += (long) mm.a[i * n + kk] * mm.b[kk * n + jj];
                            c[i * n + jj] = s;
                        } else {
                            for (int kk = 0; kk < n; kk++) c[i * n + jj] += (long) mm.a[i * n + kk] * mm.b[kk * n + jj];
                        }
                    }
                return joinLongs(c);
            }
            default:
                throw new IllegalArgumentException("unknown variant " + variant);
        }
    }

    /** fixed verification cases per algorithm family (shared contract) */
    public static String verifyCasesJson(String variant) {
        long VERIFY_SEED = 0xC0DEBEEFL;
        StringBuilder js = new StringBuilder();
        js.append('{');
        boolean first = true;
        switch (familyOf(variant)) {
            case "sorting": {
                String[] ds = {"random_int", "sorted", "reverse_sorted", "nearly_sorted", "duplicate_heavy"};
                for (String d : ds) {
                    if (!first) js.append(',');
                    first = false;
                    js.append('"').append(d).append(":257\":\"")
                      .append(fnv1aHex(verifyOutput(variant, d, 257, VERIFY_SEED))).append('"');
                }
                break;
            }
            case "search":
                js.append("\"search_mixed:257\":\"")
                  .append(fnv1aHex(verifyOutput(variant, "search_mixed", 257, VERIFY_SEED))).append('"');
                break;
            case "datastructures":
                js.append("\"random_int:257\":\"")
                  .append(fnv1aHex(verifyOutput(variant, "random_int", 257, VERIFY_SEED))).append('"');
                break;
            case "graphs":
                js.append("\"graph_sparse:61\":\"")
                  .append(fnv1aHex(verifyOutput(variant, "graph_sparse", 61, VERIFY_SEED))).append('"');
                break;
            case "strings":
                js.append("\"text_corpus:1000\":\"")
                  .append(fnv1aHex(verifyOutput(variant, "text_corpus", 1000, VERIFY_SEED))).append('"');
                break;
            case "matrix":
                js.append("\"bounded_matrix:9\":\"")
                  .append(fnv1aHex(verifyOutput(variant, "bounded_matrix", 9, VERIFY_SEED))).append('"');
                break;
            default:
                break;
        }
        js.append('}');
        return js.toString();
    }

    public static String familyOf(String variant) {
        switch (variant) {
            case "merge_sort": case "quick_sort": case "heap_sort":
            case "insertion_sort": case "std_sort":
                return "sorting";
            case "linear_search": case "binary_search": case "hash_lookup":
                return "search";
            case "dynamic_array": case "queue_ops": case "priority_queue_ops":
            case "pq_std": case "hash_map_ops":
                return "datastructures";
            case "bfs": case "dfs": case "dijkstra":
                return "graphs";
            case "naive_search": case "kmp":
                return "strings";
            case "matmul_naive": case "matmul_ikj":
                return "matrix";
            default:
                return "unknown";
        }
    }
}

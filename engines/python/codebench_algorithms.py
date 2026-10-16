# CodeBench — Python algorithms, datasets and verification
#
# SplitMix64, FNV-1a 64 and every dataset generator are bit-identical to the
# C++/Java/TypeScript implementations, which is what makes cross-language
# comparisons run on logically identical inputs.
#
# Copyright © 2026 Parsa Fathi — Apache-2.0 (see LICENSE)
"""CodeBench Python engine core: deterministic datasets, algorithms, verification."""

import heapq

MASK64 = (1 << 64) - 1


def _mix(z):
    z = ((z ^ (z >> 30)) * 0xBF58476D1CE4E5B9) & MASK64
    z = ((z ^ (z >> 27)) * 0x94D049BB133111EB) & MASK64
    return (z ^ (z >> 31)) & MASK64


class SplitMix64:
    """Bit-identical to the C++/Java/TypeScript SplitMix64."""

    __slots__ = ("state",)

    def __init__(self, seed):
        s = (seed + 0x9E3779B97F4A7C15) & MASK64
        self.state = _mix(s)

    def next(self):
        self.state = (self.state + 0x9E3779B97F4A7C15) & MASK64
        return _mix(self.state)

    def rand_int(self, lo, hi):
        return lo + (self.next() % (hi - lo + 1))


def fnv1a_hex(s):
    """FNV-1a 64 over the UTF-8 bytes of s, 16 hex chars — shared checksum."""
    h = 0xcbf29ce484222325
    for b in s.encode("utf-8"):
        h ^= b
        h = (h * 0x100000001B3) & MASK64
    return format(h, "016x")


# ---------------------------------------------------------------------------
# Datasets (generation order matches the other engines exactly)
# ---------------------------------------------------------------------------

def gen_random_int(n, seed):
    rng = SplitMix64(seed)
    rng_next = rng.next
    out = []
    append = out.append
    for _ in range(n):
        append(-2147483648 + (rng_next() % 4294967296))
    return out


def gen_sorted(n, seed):
    rng = SplitMix64(seed)
    out = []
    v = rng.rand_int(0, 1000)
    for _ in range(n):
        out.append(v)
        v += rng.rand_int(0, 100)
    return out


def gen_reverse_sorted(n, seed):
    rng = SplitMix64(seed)
    out = []
    v = rng.rand_int(0, 1000)
    for _ in range(n):
        out.append(v)
        v -= rng.rand_int(0, 100)
    return out


def gen_nearly_sorted(n, seed):
    rng = SplitMix64(seed)  # one continuous stream
    out = []
    v = rng.rand_int(0, 1000)
    for _ in range(n):
        out.append(v)
        v += rng.rand_int(0, 100)
    k = max(1, n // 100)
    for _ in range(k):
        i = rng.rand_int(0, n - 2)
        j = i + rng.rand_int(1, 50)
        if j >= n:
            j = n - 1
        out[i], out[j] = out[j], out[i]
    return out


def gen_duplicate_heavy(n, seed):
    rng = SplitMix64(seed)
    return [rng.rand_int(-50, 50) for _ in range(n)]


def gen_search_mixed(n, seed):
    rng = SplitMix64(seed)
    arr = [2 * i for i in range(n)]
    queries = []
    for j in range(n):
        if j % 2 == 0:
            queries.append(arr[rng.rand_int(0, n - 1)])
        else:
            queries.append(arr[rng.rand_int(0, n - 1)] + 1)  # odd -> miss
    return arr, queries


def gen_graph_sparse(n, seed):
    rng = SplitMix64(seed)
    adj = [[] for _ in range(n)]
    for u in range(n):
        for _ in range(6):
            adj[u].append((rng.rand_int(0, n - 1), rng.rand_int(1, 1000)))
    return adj


def gen_text_corpus(n, seed):
    rng = SplitMix64(seed)
    alpha = "ACGT"
    pattern = "".join(alpha[rng.rand_int(0, 3)] for _ in range(32))
    corpus = "".join(alpha[rng.rand_int(0, 3)] for _ in range(n))
    pos = n // 2
    corpus = corpus[:pos] + pattern + corpus[pos + 32:]
    return corpus, pattern


def gen_bounded_matrix(n, seed):
    rng = SplitMix64(seed)
    a = [[rng.rand_int(-100, 100) for _ in range(n)] for _ in range(n)]
    b = [[rng.rand_int(-100, 100) for _ in range(n)] for _ in range(n)]
    return a, b


def gen_distinct_shuffle(n, seed):
    rng = SplitMix64(seed)
    a = list(range(n))
    for i in range(n - 1, 0, -1):
        j = rng.rand_int(0, i)
        a[i], a[j] = a[j], a[i]
    return a


def make_sort_input(dataset, n, seed):
    if dataset == "sorted":
        return gen_sorted(n, seed)
    if dataset == "reverse_sorted":
        return gen_reverse_sorted(n, seed)
    if dataset == "nearly_sorted":
        return gen_nearly_sorted(n, seed)
    if dataset == "duplicate_heavy":
        return gen_duplicate_heavy(n, seed)
    return gen_random_int(n, seed)


def canonical_input_for(dataset, n, seed):
    if dataset == "search_mixed":
        arr, queries = gen_search_mixed(n, seed)
        return ",".join(map(str, arr)) + "|" + ",".join(map(str, queries))
    if dataset == "graph_sparse":
        adj = gen_graph_sparse(n, seed)
        parts = []
        for u in range(n):
            for to, w in adj[u]:
                parts.append(f"{u}:{to}:{w}")
        return ",".join(parts)
    if dataset == "text_corpus":
        corpus, pattern = gen_text_corpus(n, seed)
        return corpus + "|" + pattern
    if dataset == "bounded_matrix":
        a, b = gen_bounded_matrix(n, seed)
        flat_a = []
        flat_b = []
        for row in a:
            flat_a.extend(row)
        for row in b:
            flat_b.extend(row)
        return ",".join(map(str, flat_a)) + "|" + ",".join(map(str, flat_b))
    # integer-array datasets
    if dataset == "sorted":
        vals = gen_sorted(n, seed)
    elif dataset == "reverse_sorted":
        vals = gen_reverse_sorted(n, seed)
    elif dataset == "nearly_sorted":
        vals = gen_nearly_sorted(n, seed)
    elif dataset == "duplicate_heavy":
        vals = gen_duplicate_heavy(n, seed)
    else:
        vals = gen_random_int(n, seed)
    return ",".join(map(str, vals))


# ---------------------------------------------------------------------------
# Sorting algorithms (hand-written, same structure as the other engines)
# ---------------------------------------------------------------------------

def insertion_sort_range(a, lo, hi):
    for i in range(lo + 1, hi):
        v = a[i]
        k = i - 1
        while k >= lo and a[k] > v:
            a[k + 1] = a[k]
            k -= 1
        a[k + 1] = v


def merge_sort(a):
    n = len(a)
    aux = [0] * n

    def rec(lo, hi):
        if hi - lo <= 1:
            return
        mid = (lo + hi) // 2
        rec(lo, mid)
        rec(mid, hi)
        i = l = lo
        r = mid
        while l < mid and r < hi:
            if a[l] <= a[r]:
                aux[i] = a[l]
                l += 1
            else:
                aux[i] = a[r]
                r += 1
            i += 1
        while l < mid:
            aux[i] = a[l]
            l += 1
            i += 1
        while r < hi:
            aux[i] = a[r]
            r += 1
            i += 1
        a[lo:hi] = aux[lo:hi]

    rec(0, n)


def quick_sort(a):
    def rec(lo, hi):
        while hi - lo > 16:
            mid = (lo + hi) // 2
            x, y, z = a[lo], a[mid], a[hi - 1]
            if x > y:
                x, y = y, x
            if y > z:
                y, z = z, y
            if x > y:
                x, y = y, x
            pivot = y
            i = k = lo
            j = hi
            while k < j:
                if a[k] < pivot:
                    a[i], a[k] = a[k], a[i]
                    i += 1
                    k += 1
                elif a[k] > pivot:
                    j -= 1
                    a[k], a[j] = a[j], a[k]
                else:
                    k += 1
            if i - lo < hi - j:
                rec(lo, i)
                lo = j
            else:
                rec(j, hi)
                hi = i
        insertion_sort_range(a, lo, hi)

    rec(0, len(a))


def heap_sort(a):
    n = len(a)

    def sift_down(start, end):
        root = start
        while True:
            c = 2 * root + 1
            if c > end:
                break
            if c + 1 <= end and a[c] < a[c + 1]:
                c += 1
            if a[root] < a[c]:
                a[root], a[c] = a[c], a[root]
                root = c
            else:
                break

    for start in range((n - 2) // 2, -1, -1):
        sift_down(start, n - 1)
    for end in range(n - 1, 0, -1):
        a[0], a[end] = a[end], a[0]
        sift_down(0, end - 1)


# ---------------------------------------------------------------------------
# Canonical verification output for one (variant, dataset, size, seed)
# ---------------------------------------------------------------------------

VERIFY_SEED = 0xC0DEBEEF


def verify_output(variant, dataset, n, seed):
    if variant in ("merge_sort", "quick_sort", "heap_sort", "insertion_sort", "std_sort"):
        b = make_sort_input(dataset, n, seed)
        if variant == "merge_sort":
            merge_sort(b)
        elif variant == "quick_sort":
            quick_sort(b)
        elif variant == "heap_sort":
            heap_sort(b)
        elif variant == "insertion_sort":
            insertion_sort_range(b, 0, len(b))
        else:
            b.sort()
        return ",".join(map(str, b))

    if variant in ("linear_search", "binary_search", "hash_lookup"):
        arr, queries = gen_search_mixed(n, seed)
        out = []
        if variant == "linear_search":
            for q in queries:
                r = -1
                for i in range(n):
                    if arr[i] == q:
                        r = i
                        break
                out.append(r)
        elif variant == "binary_search":
            for q in queries:
                lo, hi = 0, n - 1
                r = -1
                while lo <= hi:
                    mid = (lo + hi) // 2
                    v = arr[mid]
                    if v == q:
                        r = mid
                        break
                    if v < q:
                        lo = mid + 1
                    else:
                        hi = mid - 1
                out.append(r)
        else:
            table = {v: i for i, v in enumerate(arr)}
            for q in queries:
                out.append(table.get(q, -1))
        return ",".join(map(str, out))

    if variant == "dynamic_array":
        v = []
        for x in gen_random_int(n, seed):
            v.append(x)
        return ",".join(map(str, v))

    if variant == "queue_ops":
        from collections import deque

        q = deque()
        for x in gen_random_int(n, seed):
            q.append(x)
        out = []
        while q:
            out.append(q.popleft())
        return ",".join(map(str, out))

    if variant == "priority_queue_ops":
        heap = []  # hand-written binary heap over a list
        push = heap.append

        def sift_up(i):
            while i > 0:
                p = (i - 1) // 2
                if heap[p] <= heap[i]:
                    break
                heap[p], heap[i] = heap[i], heap[p]
                i = p

        for x in gen_distinct_shuffle(n, seed):
            push(x)
            sift_up(len(heap) - 1)
        out = []
        while heap:
            out.append(heap[0])
            last = heap.pop()
            if heap:
                heap[0] = last
                i = 0
                m = len(heap)
                while True:
                    c = 2 * i + 1
                    if c >= m:
                        break
                    if c + 1 < m and heap[c + 1] < heap[c]:
                        c += 1
                    if heap[i] <= heap[c]:
                        break
                    heap[i], heap[c] = heap[c], heap[i]
                    i = c
        return ",".join(map(str, out))

    if variant == "pq_std":
        heap = []
        for x in gen_distinct_shuffle(n, seed):
            heapq.heappush(heap, x)
        out = []
        while heap:
            out.append(heapq.heappop(heap))
        return ",".join(map(str, out))

    if variant == "hash_map_ops":
        s = gen_distinct_shuffle(n, seed)
        m = {}
        for i, k in enumerate(s):
            m[k] = i
        out = []
        for k in s:
            out.append(m.get(k, -1))
        for k in s:
            del m[k]
        return ",".join(map(str, out)) + "|" + str(len(m))

    if variant in ("bfs", "dfs"):
        adj = gen_graph_sparse(n, seed)
        visited = [False] * n
        order = []
        if variant == "bfs":
            from collections import deque

            q = deque([0])
            visited[0] = True
            while q:
                u = q.popleft()
                order.append(u)
                for to, _w in adj[u]:
                    if not visited[to]:
                        visited[to] = True
                        q.append(to)
        else:
            stack = [0]
            visited[0] = True
            while stack:
                u = stack.pop()
                order.append(u)
                for to, _w in reversed(adj[u]):
                    if not visited[to]:
                        visited[to] = True
                        stack.append(to)
        return ",".join(map(str, order))

    if variant == "dijkstra":
        SHIFT = 1048576  # 2^20 — matches all engines
        adj = gen_graph_sparse(n, seed)
        dist = [-1] * n
        done = [False] * n
        heap = []
        dist[0] = 0
        heapq.heappush(heap, 0)
        while heap:
            enc = heapq.heappop(heap)
            d = enc // SHIFT
            u = enc % SHIFT
            if done[u]:
                continue
            done[u] = True
            for to, w in adj[u]:
                nd = d + w
                if dist[to] == -1 or nd < dist[to]:
                    dist[to] = nd
                    heapq.heappush(heap, nd * SHIFT + to)
        return ",".join(map(str, dist))

    if variant in ("naive_search", "kmp"):
        corpus, pattern = gen_text_corpus(n, seed)
        m = len(pattern)
        offsets = []
        if variant == "naive_search":
            for i in range(n - m + 1):
                if corpus[i : i + m] == pattern:
                    offsets.append(i)
        else:
            fail = [0] * m
            k = 0
            for i in range(1, m):
                while k > 0 and pattern[i] != pattern[k]:
                    k = fail[k - 1]
                if pattern[i] == pattern[k]:
                    k += 1
                fail[i] = k
            k = 0
            for i in range(n):
                while k > 0 and corpus[i] != pattern[k]:
                    k = fail[k - 1]
                if corpus[i] == pattern[k]:
                    k += 1
                if k == m:
                    offsets.append(i - m + 1)
                    k = fail[k - 1]
        return str(len(offsets)) + "|" + ",".join(map(str, offsets))

    if variant in ("matmul_naive", "matmul_ikj"):
        a, b = gen_bounded_matrix(n, seed)
        c = [[0] * n for _ in range(n)]
        if variant == "matmul_naive":
            for i in range(n):
                ai = a[i]
                ci = c[i]
                for jj in range(n):
                    s = 0
                    for kk in range(n):
                        s += ai[kk] * b[kk][jj]
                    ci[jj] = s
        else:
            for i in range(n):
                ai = a[i]
                ci = c[i]
                for kk in range(n):
                    aik = ai[kk]
                    bk = b[kk]
                    for jj in range(n):
                        ci[jj] += aik * bk[jj]
        flat = []
        for row in c:
            flat.extend(row)
        return ",".join(map(str, flat))

    raise ValueError(f"unknown variant {variant}")


def family_of(variant):
    if variant in ("merge_sort", "quick_sort", "heap_sort", "insertion_sort", "std_sort"):
        return "sorting"
    if variant in ("linear_search", "binary_search", "hash_lookup"):
        return "search"
    if variant in ("dynamic_array", "queue_ops", "priority_queue_ops", "pq_std", "hash_map_ops"):
        return "datastructures"
    if variant in ("bfs", "dfs", "dijkstra"):
        return "graphs"
    if variant in ("naive_search", "kmp"):
        return "strings"
    if variant in ("matmul_naive", "matmul_ikj"):
        return "matrix"
    return "unknown"


def verify_cases(variant):
    """Fixed small verification cases: {key: output_checksum}."""
    fam = family_of(variant)
    cases = {}
    if fam == "sorting":
        for ds in ("random_int", "sorted", "reverse_sorted", "nearly_sorted", "duplicate_heavy"):
            cases[f"{ds}:257"] = fnv1a_hex(verify_output(variant, ds, 257, VERIFY_SEED))
    elif fam == "search":
        cases["search_mixed:257"] = fnv1a_hex(verify_output(variant, "search_mixed", 257, VERIFY_SEED))
    elif fam == "datastructures":
        cases["random_int:257"] = fnv1a_hex(verify_output(variant, "random_int", 257, VERIFY_SEED))
    elif fam == "graphs":
        cases["graph_sparse:61"] = fnv1a_hex(verify_output(variant, "graph_sparse", 61, VERIFY_SEED))
    elif fam == "strings":
        cases["text_corpus:1000"] = fnv1a_hex(verify_output(variant, "text_corpus", 1000, VERIFY_SEED))
    elif fam == "matrix":
        cases["bounded_matrix:9"] = fnv1a_hex(verify_output(variant, "bounded_matrix", 9, VERIFY_SEED))
    return cases

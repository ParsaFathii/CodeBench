#!/usr/bin/env python3
# CodeBench — Python benchmark runner (pyperf harness)
#
# One process executes one job selected via environment variables:
#   CB_VARIANT / CB_DATASET / CB_SIZE / CB_SEED / CB_VERIFY_OUT
#
# pyperf drives the measurement: the coordinator invokes
#   python3 codebench_bench.py -o results.json --values=R --warmups=W ...
# pyperf spawns an isolated worker process; each collected value is one raw
# observation (seconds per operation, converted to ns by the coordinator).
#
# Verification runs first in the main process (never inside the pyperf
# worker): the exact measured input plus the fixed small cases are executed
# untimed and their FNV-1a 64 checksums are written to the sidecar file.
#
# Copyright © 2026 Parsa Fathi — Apache-2.0 (see LICENSE)

import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import codebench_algorithms as cb

VARIANT = os.environ.get("CB_VARIANT", "merge_sort")
DATASET = os.environ.get("CB_DATASET", "random_int")
SIZE = int(os.environ.get("CB_SIZE", "10000"))
SEED = int(os.environ.get("CB_SEED", "1"))
VERIFY_OUT = os.environ.get("CB_VERIFY_OUT")

IS_WORKER = "--worker" in sys.argv  # pyperf re-executes this script per worker


def write_verify_sidecar():
    if not VERIFY_OUT or IS_WORKER:
        return
    payload = {
        "variant": VARIANT,
        "input": cb.fnv1a_hex(cb.canonical_input_for(DATASET, SIZE, SEED)),
        "output": cb.fnv1a_hex(cb.verify_output(VARIANT, DATASET, SIZE, SEED)),
        "cases": cb.verify_cases(VARIANT),
    }
    with open(VERIFY_OUT, "w", encoding="utf-8") as f:
        json.dump(payload, f)


# ---------------------------------------------------------------------------
# Workload preparation (untimed) — pristine inputs reused across repetitions
# ---------------------------------------------------------------------------

class Workload:
    __slots__ = (
        "sort_input", "arr", "queries", "table", "stream", "distinct",
        "adj", "corpus", "pattern", "a", "b", "c",
    )


def prepare():
    w = Workload()
    fam = cb.family_of(VARIANT)
    if fam == "sorting":
        w.sort_input = cb.make_sort_input(DATASET, SIZE, SEED)
    elif fam == "search":
        w.arr, w.queries = cb.gen_search_mixed(SIZE, SEED)
        if VARIANT == "hash_lookup":
            w.table = {v: i for i, v in enumerate(w.arr)}
    elif fam == "datastructures":
        if VARIANT in ("dynamic_array", "queue_ops"):
            w.stream = cb.gen_random_int(SIZE, SEED)
        else:
            w.distinct = cb.gen_distinct_shuffle(SIZE, SEED)
    elif fam == "graphs":
        w.adj = cb.gen_graph_sparse(SIZE, SEED)
    elif fam == "strings":
        w.corpus, w.pattern = cb.gen_text_corpus(SIZE, SEED)
    elif fam == "matrix":
        w.a, w.b = cb.gen_bounded_matrix(SIZE, SEED)
        w.c = [[0] * SIZE for _ in range(SIZE)]
    return w


# ---------------------------------------------------------------------------
# One measured operation per variant (mirrors the C++/Java ops exactly)
# ---------------------------------------------------------------------------

def make_op(w):
    variant = VARIANT
    fam = cb.family_of(variant)
    q_idx = [0]

    if fam == "sorting":
        pristine = w.sort_input
        if variant == "merge_sort":
            def op():
                buf = pristine[:]  # defensive copy is part of the op
                cb.merge_sort(buf)
                return buf[0] + buf[-1]
        elif variant == "quick_sort":
            def op():
                buf = pristine[:]
                cb.quick_sort(buf)
                return buf[0] + buf[-1]
        elif variant == "heap_sort":
            def op():
                buf = pristine[:]
                cb.heap_sort(buf)
                return buf[0] + buf[-1]
        elif variant == "insertion_sort":
            def op():
                buf = pristine[:]
                cb.insertion_sort_range(buf, 0, len(buf))
                return buf[0] + buf[-1]
        else:  # std_sort
            def op():
                buf = pristine[:]
                buf.sort()
                return buf[0] + buf[-1]
        return op

    if fam == "search":
        arr = w.arr
        queries = w.queries
        n = SIZE
        if variant == "linear_search":
            def op():
                q = queries[q_idx[0] % n]
                q_idx[0] += 1
                for i in range(n):
                    if arr[i] == q:
                        return i
                return -1
        elif variant == "binary_search":
            def op():
                q = queries[q_idx[0] % n]
                q_idx[0] += 1
                lo, hi = 0, n - 1
                while lo <= hi:
                    mid = (lo + hi) // 2
                    v = arr[mid]
                    if v == q:
                        return mid
                    if v < q:
                        lo = mid + 1
                    else:
                        hi = mid - 1
                return -1
        else:  # hash_lookup
            table = w.table

            def op():
                q = queries[q_idx[0] % n]
                q_idx[0] += 1
                return table.get(q, -1)
        return op

    if variant == "dynamic_array":
        stream = w.stream

        def op():
            v = []  # fresh list: growth policy is part of the op
            append = v.append
            for x in stream:
                append(x)
            return len(v) + v[-1]
        return op

    if variant == "queue_ops":
        from collections import deque

        stream = w.stream

        def op():
            q = deque()
            append = q.append
            for x in stream:
                append(x)
            acc = 0
            pop = q.popleft
            while q:
                acc += pop()
            return acc
        return op

    if variant == "priority_queue_ops":
        distinct = w.distinct

        def op():
            heap = []  # hand-written binary min-heap over a list
            push = heap.append
            for x in distinct:
                push(x)
                i = len(heap) - 1
                while i > 0:
                    p = (i - 1) // 2
                    if heap[p] <= heap[i]:
                        break
                    heap[p], heap[i] = heap[i], heap[p]
                    i = p
            acc = 0
            while heap:
                acc += heap[0]
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
            return acc
        return op

    if variant == "pq_std":
        distinct = w.distinct

        def op():
            heap = []
            hpush = heapq.heappush
            for x in distinct:
                hpush(heap, x)
            acc = 0
            hpop = heapq.heappop
            while heap:
                acc += hpop(heap)
            return acc
        return op

    if variant == "hash_map_ops":
        distinct = w.distinct

        def op():
            m = {}
            i = 0
            for k in distinct:
                m[k] = i
                i += 1
            acc = 0
            get = m.get
            for k in distinct:
                v = get(k)
                acc += -1 if v is None else v
            for k in distinct:
                del m[k]
            return acc + len(m)
        return op

    if variant == "bfs":
        adj = w.adj
        from collections import deque

        def op():
            n = len(adj)
            visited = [False] * n  # reset is part of the op
            q = deque((0,))
            visited[0] = True
            acc = 0
            pop = q.popleft
            append = q.append
            while q:
                u = pop()
                acc += u
                for to, _w in adj[u]:
                    if not visited[to]:
                        visited[to] = True
                        append(to)
            return acc
        return op

    if variant == "dfs":
        adj = w.adj

        def op():
            n = len(adj)
            visited = [False] * n
            stack = [0]
            visited[0] = True
            acc = 0
            pop = stack.pop
            append = stack.append
            while stack:
                u = pop()
                acc += u
                for to, _w in reversed(adj[u]):
                    if not visited[to]:
                        visited[to] = True
                        append(to)
            return acc
        return op

    if variant == "dijkstra":
        adj = w.adj
        SHIFT = 1048576  # 2^20 — matches all engines

        def op():
            n = len(adj)
            dist = [-1] * n
            done = [False] * n
            heap = []
            hpush = heapq.heappush
            hpop = heapq.heappop
            dist[0] = 0
            hpush(heap, 0)
            while heap:
                enc = hpop(heap)
                d = enc // SHIFT
                u = enc % SHIFT
                if done[u]:
                    continue
                done[u] = True
                for to, w in adj[u]:
                    nd = d + w
                    if dist[to] == -1 or nd < dist[to]:
                        dist[to] = nd
                        hpush(heap, nd * SHIFT + to)
            return sum(dist)
        return op

    if variant == "naive_search":
        corpus = w.corpus
        pattern = w.pattern
        m = len(pattern)

        def op():
            acc = 0
            for i in range(len(corpus) - m + 1):
                if corpus[i : i + m] == pattern:
                    acc += i
            return acc
        return op

    if variant == "kmp":
        corpus = w.corpus
        pattern = w.pattern
        m = len(pattern)

        def op():
            fail = [0] * m
            k = 0
            for i in range(1, m):
                while k > 0 and pattern[i] != pattern[k]:
                    k = fail[k - 1]
                if pattern[i] == pattern[k]:
                    k += 1
                fail[i] = k
            k = 0
            acc = 0
            for i in range(len(corpus)):
                while k > 0 and corpus[i] != pattern[k]:
                    k = fail[k - 1]
                if corpus[i] == pattern[k]:
                    k += 1
                if k == m:
                    acc += i - m + 1
                    k = fail[k - 1]
            return acc
        return op

    if variant in ("matmul_naive", "matmul_ikj"):
        a = w.a
        b = w.b
        c = w.c
        n = SIZE
        if variant == "matmul_naive":
            def op():
                for i in range(n):
                    ai = a[i]
                    ci = c[i]
                    for jj in range(n):
                        s = 0
                        for kk in range(n):
                            s += ai[kk] * b[kk][jj]
                        ci[jj] = s
                return c[0][0]
        else:
            def op():
                for i in range(n):
                    ai = a[i]
                    ci = c[i]
                    for kk in range(n):
                        aik = ai[kk]
                        bk = b[kk]
                        for jj in range(n):
                            ci[jj] += aik * bk[jj]
                return c[0][0]
        return op

    raise ValueError(f"unknown variant {VARIANT}")


def main():
    write_verify_sidecar()  # verification happens before any timing

    try:
        import pyperf
    except ImportError:
        print(
            json.dumps({"error": "pyperf is not installed (pip install pyperf)"}),
            file=sys.stderr,
        )
        return 3

    w = prepare()
    op = make_op(w)
    runner = pyperf.Runner()
    runner.bench_func(f"{VARIANT}_{SIZE}", op)
    return 0


if __name__ == "__main__":
    sys.exit(main())

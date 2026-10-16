# Algorithm catalog

CodeBench ships 20 benchmark variants across 6 families. Every variant exists
in all three languages (C++, Java, Python) and has a TypeScript reference
implementation used for verification. The catalog is defined in
`src/lib/bench/registry.ts`; the implementations live in
`engines/cpp/codebench.cpp`, `engines/java/src/codebench/` and
`engines/python/`.

## Variant table

"Category" distinguishes hand-written implementations (same algorithmic
structure in each language) from standard-library comparisons (each
language's library routine; differences include library engineering, not just
the runtime).

| Variant key | Category | Complexity | Datasets | Default sizes | Notes |
|---|---|---|---|---|---|
| `sorting.merge_sort` | hand-written | O(n log n) | 5 sorting datasets | 10000, 100000 | top-down, one aux buffer per op |
| `sorting.quick_sort` | hand-written | O(n log n) avg | 5 sorting datasets | 10000, 100000 | median-of-three, insertion cutoff ≤ 16 |
| `sorting.heap_sort` | hand-written | O(n log n) | 5 sorting datasets | 10000, 100000 | in-place, sift-down extraction |
| `sorting.insertion_sort` | hand-written | O(n²) | 5 sorting datasets | 10000, 100000 | **capped at n ≤ 4096** (`maxSize`) |
| `sorting.std_sort` | standard-library | O(n log n) | 5 sorting datasets | 10000, 100000 | std::sort / Arrays.sort(int[]) / list.sort |
| `search.linear_search` | hand-written | O(n) per query | search_mixed | 16384, 131072 | signed 64-bit keys |
| `search.binary_search` | hand-written | O(log n) per query | search_mixed | 16384, 131072 | classic half-interval |
| `search.hash_lookup` | standard-library | O(1) avg per query | search_mixed | 16384, 131072 | table built in untimed setup; Java boxes `Long` |
| `datastructures.dynamic_array` | hand-written | O(n) amortized | random_int | 16384, 131072 | vector / ArrayList / list growth |
| `datastructures.queue_ops` | hand-written | O(n) | random_int | 16384, 131072 | deque / ArrayDeque / collections.deque |
| `datastructures.priority_queue_ops` | hand-written | O(n log n) | random_int | 16384, 131072 | hand-written binary min-heap |
| `datastructures.pq_std` | standard-library | O(n log n) | random_int | 16384, 131072 | std::priority_queue / PriorityQueue / heapq |
| `datastructures.hash_map_ops` | standard-library | O(n) avg | random_int | 16384, 131072 | insert-all + lookup-all + delete-all cycle |
| `graphs.bfs` | hand-written | O(V + E) | graph_sparse | 1024, 4096 | from node 0, FIFO queue |
| `graphs.dfs` | hand-written | O(V + E) | graph_sparse | 1024, 4096 | iterative, explicit stack |
| `graphs.dijkstra` | hand-written | O((V + E) log V) | graph_sparse | 1024, 4096 | binary min-heap; Java uses java.util.PriorityQueue |
| `strings.naive_search` | hand-written | O(n·m) | text_corpus | 100000, 1000000 | sliding window |
| `strings.kmp` | hand-written | O(n + m) | text_corpus | 100000, 1000000 | failure function per op |
| `matrix.matmul_naive` | hand-written | O(n³) | bounded_matrix | 64, 128 | i-j-k loop order |
| `matrix.matmul_ikj` | hand-written | O(n³) | bounded_matrix | 64, 128 | i-k-j loop order |

All variants support all three languages (`cpp`, `java`, `python`).

---

## Sorting

**Implementation notes.** Hand-written sorts are the same algorithmic
structure in every language: merge sort with an auxiliary buffer allocated
per operation; quicksort with median-of-three pivot selection, a three-way
(Bentley–McIlroy style) partition and insertion sort for sub-ranges of ≤ 16
elements; in-place heap sort with a max-heapify phase and sift-down root
extraction; textbook insertion sort. `std_sort` calls the platform library:
`std::sort` (introsort), `Arrays.sort` on `int[]` (dual-pivot quicksort) and
CPython's `list.sort` (Timsort).

**One measured operation:** copy the pristine input array, sort the copy in
place, consume first and last elements. The defensive copy is part of the
measured op in *all* languages (the sort is destructive and every repetition
must see identical input).

**Output contract:** array sorted in non-decreasing order; canonical form is
the comma-joined decimal values of the sorted array.

**Datasets:** `random_int`, `sorted`, `reverse_sorted`, `nearly_sorted`,
`duplicate_heavy` — the same five shape stressors for every sort variant.

**Cap:** `insertion_sort` rejects input sizes above 4096; its quadratic cost
would dominate a run without adding information.

## Search

**Implementation notes.** The workload is a sorted array of n distinct even
integers (`arr[i] = 2i`) with a deterministic query set of n queries — even
query indices are guaranteed hits, odd indices are guaranteed misses (value
+ 1). Linear search scans signed 64-bit keys; binary search is the classic
half-interval loop; hash lookup runs against a table built during untimed
setup (`std::unordered_map<long,long>`, boxed `HashMap<Long,Long>`, `dict`).

**One measured operation:** one query against the array/table. Queries cycle
through the deterministic set so successive repetitions hit different
positions.

**Output contract:** comma-joined per-query results over the full query set
(index of the key, or −1 on miss).

## Data structures

**Implementation notes.** Workloads operate on element streams: `random_int`
for the array and queue, a distinct shuffled stream (`0..n−1`,
Fisher–Yates) for the priority queues and hash map — distinct keys make the
pop order deterministic and identical across implementations. The
hand-written priority queue is a binary min-heap written from scratch in
each language (sift-up / sift-down); `pq_std` uses the standard-library
heap. `dynamic_array` measures the amortized growth of each runtime's
native growable array (`std::vector`, `ArrayList`, `list`).

**One measured operation:** one full structure cycle on a fresh container —
append-all (dynamic array); enqueue-all + dequeue-all (queue);
push-all + pop-all (priority queues); insert-all + lookup-all + delete-all
(hash map). Constructing the container is inside the op by design; the
hash-lookup table build (search family) is the contrast case that is
*not* timed.

**Output contract:** depends on the variant — drained element order
(queue / priority queues), final array contents (dynamic array), or lookup
results plus final size (hash map, encoded `lookups|finalSize`).

## Graphs

**Implementation notes.** The graph is a sparse directed graph with n nodes
and exactly 6n edges (weights in [1, 1000]), generated deterministically.
BFS uses a FIFO queue and a visited flag array; DFS is iterative with an
explicit stack (neighbors pushed in reverse adjacency order so visit order
matches the recursive formulation); Dijkstra uses a distance array, a `done`
array and a binary min-heap — hand-written in C++ and Python,
`java.util.PriorityQueue` with lazy deletion in Java, noted per language.
Heap entries are encoded as `dist · 2^20 + node`, so ties on equal distances
break identically in every language and outputs remain comparable.

**One measured operation:** one full traversal (or single-source shortest
path run) from node 0. Allocating and clearing the visited/distance arrays
is part of the measured op, so each repetition is a complete cold traversal.

**Output contract:** BFS/DFS — comma-joined visit order; Dijkstra —
comma-joined shortest distances from the source (−1 for unreachable).

## Strings

**Implementation notes.** The corpus is a length-n string over A/C/G/T; the
pattern is 32 random characters, overwritten into the corpus at position
`⌊n/2⌋` so at least one match exists. Naive search slides the pattern over
every position; KMP computes the failure function over the pattern and then
scans once. In C++/Java the corpus is a contiguous `std::string` / `char[]`;
Python compares slices natively (`corpus[i:i+m] == pattern`), which is the
idiomatic CPython formulation.

**One measured operation:** one full scan of the corpus for the fixed
pattern; KMP's failure-table construction is included.

**Output contract:** match count, then comma-joined match offsets
(`count|offsets`).

## Matrix

**Implementation notes.** `C = A × B` over n×n matrices of signed 32-bit
integers in [−100, 100], accumulated into 64-bit elements. The result
matrix is pre-allocated outside the measured op and every element is
written on each operation: the i-j-k variant overwrites each element with a
fresh dot product; the i-k-j variant accumulates rank-1 updates (the C++
op also zeroes the buffer inside the measured op, while the Java and Python
ops reuse the pre-allocated accumulator). The two variants perform
identical arithmetic in different loop orders: i-j-k (row-major dot
products) vs i-k-j (better locality and no inner-loop dependency chain).
The locality difference lands differently in each language — that contrast
is the point of the pair.

**One measured operation:** one full n×n multiplication.

**Output contract:** comma-joined row-major values of the product matrix.

---

## Cross-cutting rules

- Every variant's canonical output for the same `(dataset, n, seed)` is
  identical across languages — enforced by FNV-1a 64 checksum comparison
  (see `BENCHMARK_METHODOLOGY.md`).
- Fixed verification cases per family: sorting n=257 on 5 datasets; search
  n=257; data structures n=257; graphs n=61 nodes; strings n=1000; matrix
  9×9.
- Input sizes are configurable per experiment (valid range 8 to 2,000,000,
  subject to per-variant caps such as insertion sort's 4096).

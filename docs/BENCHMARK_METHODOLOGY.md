# Benchmark methodology

This document describes exactly how CodeBench measures things, including the
parts that are imperfect. The intent is that a reader can decide for
themselves how much to trust a given number.

All timings are **average time per operation** (`avgt`, reported in ns/op).
One "operation" is defined per variant in `ALGORITHMS.md`; it is the same
definition in all three languages.

## Warm-up policy per harness

Each harness handles warm-up in the way that is idiomatic — and necessary —
for its runtime:

| Harness | Warm-up mechanism | Mapping of the `warmup` config field |
|---|---|---|
| Google Benchmark (C++) | An explicit **untimed loop** in `main()` runs the measured op `warmup` times on a freshly generated workload *before* `benchmark::RunSpecifiedBenchmarks()` takes over. Caches and branch predictors are hot; there is no JIT to warm. | `CB_WARMUP` env var (default 2) |
| JMH (Java) | `-wi <warmup>` warm-up iterations of `-w 1s` each, executed by JMH before the measured iterations, in a single forked JVM (`-f 1`). This brings the measured method to a JIT-compiled steady state. | `warmup` (clamped to ≥ 1) |
| pyperf (Python) | `-w <warmup>` warm-up values collected (and discarded) by pyperf's isolated worker process before the `-n <repetitions>` measured values. | `warmup` (clamped to ≥ 0) |

Other fixed harness settings: the C++ engine runs with
`--benchmark_min_time=0.05s` per repetition; JMH measured iterations run at
least `-r 200ms` each with `-Xms256m -Xmx1024m` and the `gc` profiler
enabled; pyperf runs with `--min-time 0.05s` and a single worker process
(`-p 1`).

## Repetitions and raw observations

- The experiment config field `repetitions` (default 5, minimum 2) is the
  requested number of measured repetitions.
- **Every repetition is stored as a raw observation** in
  `BenchmarkResult.observations` (ns/op). Google Benchmark contributes one
  `real_time` per repetition; JMH contributes one value per measured
  iteration from `primaryMetric.rawData`; pyperf contributes one value per
  collected value (seconds converted to ns).
- All statistics are computed from the raw observations by
  `src/lib/bench/stats.ts` — never by the harnesses and never by the AI:
  `n`, `min`, `max`, `mean`, `median`, sample standard deviation (`n − 1`),
  percentiles `p5 / p25 / p75 / p95 / p99` (R-7 linear interpolation, the
  numpy/pandas default), `iqr`, `mad` (median absolute deviation about the
  median), `cv` (stddev / |mean|), and a 95% t-interval on the mean.
- The stored `statsJson` is derived data; it can always be recomputed from
  `observations`.

## Outliers

Outliers are detected with the standard IQR rule: observations outside
`[Q1 − 1.5·IQR, Q3 + 1.5·IQR]` are listed in `stats.outliersIqr`. They are
**flagged and retained, never silently dropped**. The mean, stddev and CI
include them; the median and MAD are robust to them. This is a deliberate
choice: an outlier is information about the measurement environment
(scheduler hiccup, GC, thermal event), and deleting it would hide exactly
the instability a reader should know about.

## Stability classification

The coefficient of variation (CV) of a result's observations is classified
as:

| CV | Stability | Interpretation |
|---|---|---|
| < 3% | `stable` | Trust the median; comparisons at this level are meaningful |
| 3% – < 10% | `moderate` | Usable, but keep the run-to-run noise in mind |
| ≥ 10% | `unstable` | The coordinator logs a warning; treat the measurement as unstable and consider re-running |

## Deterministic inputs

All benchmark inputs are generated from a shared, bit-identical PRNG
implemented in TypeScript (`src/lib/bench/prng.ts`), C++, Java and Python.

### SplitMix64

```
GOLDEN = 0x9e3779b97f4a7c15

mix(z):
    z = (z ^ (z >> 30)) * 0xbf58476d1ce4e5b9   (mod 2^64)
    z = (z ^ (z >> 27)) * 0x94d049bb133111eb   (mod 2^64)
    return z ^ (z >> 31)

constructor(seed):
    s   = (seed + GOLDEN) mod 2^64     // seed-hashing step
    state = mix(s)

next():
    state = (state + GOLDEN) mod 2^64
    return mix(state)

randInt(lo, hi):                        // inclusive bounds
    return lo + (next() mod (hi - lo + 1))
```

The **seed-hashing step** (adding the golden ratio constant and mixing once
in the constructor) decorrelates nearby experiment seeds: sequential seeds
produce unrelated streams.

**Modulo bias:** `randInt` uses reduction modulo the range, so when 2^64 is
not an exact multiple of the range, some values are marginally more likely
than others. This bias is *identical in every language* (all four
implementations use the same operation order), so datasets remain
bit-identical across languages and over time. It is documented rather than
fixed; for benchmark inputs the bias is statistically irrelevant.

### Dataset generators (exact value ranges)

For a given `(dataset, n, seed)` every language produces the identical
array/string/graph:

| Dataset | Generator | Values |
|---|---|---|
| `random_int` | one `randInt(-2147483648, 2147483647)` per element | full signed 32-bit range |
| `sorted` | start `randInt(0, 1000)`, each next value += `randInt(0, 100)` | non-decreasing |
| `reverse_sorted` | start `randInt(0, 1000)`, each next value −= `randInt(0, 100)` | non-increasing |
| `nearly_sorted` | sorted stream, then `max(1, n/100)` swaps at `i = randInt(0, n−2)`, `j = min(n−1, i + randInt(1, 50))` | one continuous RNG stream |
| `duplicate_heavy` | `randInt(-50, 50)` per element | 101 distinct values |
| `search_mixed` | array `arr[i] = 2i` (n distinct even values); n queries: even index → hit `arr[randInt(0, n−1)]`, odd index → that value + 1 (guaranteed miss) | exactly 50% hits |
| `graph_sparse` | directed graph, 6 edges per node: `to = randInt(0, n−1)`, weight `randInt(1, 1000)` | self-loops possible |
| `text_corpus` | alphabet A/C/G/T; 32-char random pattern; n-char random corpus with the pattern overwritten at position `⌊n/2⌋` | at least one guaranteed match |
| `bounded_matrix` | two n×n matrices, entries `randInt(-100, 100)` | |
| (internal) `distinct_shuffle` | Fisher–Yates shuffle of `0..n−1` | used by priority-queue and hash-map workloads |

## Verification

Correctness is checked before and separately from timing:

1. **Checksums.** Inputs and outputs are encoded canonically (for example,
   comma-joined decimal values; `arr|queries` for search; `count|offsets`
   for string matching) and hashed with **FNV-1a 64** (offset basis
   `0xcbf29ce484222325`, prime `0x100000001b3`, 16-char lowercase hex).
   FNV-1a and SplitMix64 are implemented bit-identically in all four
   codebases.
2. **Fixed verify cases.** Every language engine runs its variant on fixed
   small inputs with the fixed verification seed `0xC0DEBEEF`:
   - sorting: `n = 257` on all five sorting datasets
   - search: `search_mixed`, `n = 257`
   - data structures: `random_int`, `n = 257`
   - graphs: `graph_sparse`, `n = 61` nodes
   - strings: `text_corpus`, `n = 1000`
   - matrix: `bounded_matrix`, `n = 9` (9×9)
3. **Reference implementation.** A TypeScript reference
   (`src/lib/bench/reference.ts`) implements every variant for clarity, not
   speed. After a run, the coordinator recomputes the fixed-case checksums
   from the reference and compares (`refMatch`). A mismatch marks the result
   `FAILED` — it is not a valid measurement.
4. **Cross-language equality.** Results are grouped by
   (variant, dataset, size). When more than one language is present, the
   input checksums and output checksums must be identical within the group;
   otherwise the comparison is invalid and all rows in the group are marked
   failed. A standalone gate, `bun scripts/verify-crosslang.ts`, checks all
   20 variants — 120 checksum comparisons across the reference and the three
   engines — and must pass before any timing is trusted.

Verification always executes untimed, on the exact measured input plus the
fixed cases, before the harness begins measuring.

## Measured-op contracts

The definitions below are implemented identically in all languages; they are
what makes cross-language numbers comparable.

- **Destructive sorts include the defensive copy.** Sorting destroys its
  input, and every repetition must see identical data. The copy of the
  pristine input array is therefore *inside* the measured op in C++, Java
  and Python alike. Cross-language sort comparisons include this equal,
  O(n) copy on both sides.
- **Graph traversals include the visited-array reset.** BFS/DFS (and the
  distance/done arrays of Dijkstra) are allocated/zeroed per operation, so a
  full traversal is measured, not a warm re-walk.
- **Hash-table build is untimed setup for lookups.** `search.hash_lookup`
  builds the table of n entries during setup (JMH `@Setup` / GB setup /
  pyperf `prepare()`); only the lookup itself is measured. In contrast,
  `datastructures.hash_map_ops` measures a full insert-all + lookup-all +
  delete-all cycle including construction.
- **Fresh containers per op.** Data-structure cycles (dynamic array, queue,
  priority queues, hash map) construct a fresh container inside the op, so
  growth policy and allocation behavior are part of what is measured.
- **Result consumption.** Every language prevents dead-code elimination the
  idiomatic way: a volatile sink + `DoNotOptimize`/`ClobberMemory` in C++,
  JMH `Blackhole` in Java, returning the accumulated value from the pyperf
  closure in Python.

## Fairness categories

Variants are labelled `hand-written` or `standard-library`, and the two
categories must not be read as the same kind of comparison:

- `sorting.std_sort` is `std::sort` (C++) vs `Arrays.sort` on `int[]` (Java,
  dual-pivot quicksort) vs `list.sort` (CPython, Timsort). These are
  different algorithms written by different teams; differences reflect
  library engineering as much as language runtime.
- `datastructures.pq_std` is `std::priority_queue` with `std::greater` vs
  `java.util.PriorityQueue` vs `heapq`.
- `search.hash_lookup` and `datastructures.hash_map_ops` are
  `std::unordered_map<long,long>` vs `HashMap<Long,Long>` vs `dict`. The
  Java variants box `Long` keys — that is the idiomatic cost of the workload
  in Java and is part of what is measured, not an accident.
- Hand-written variants (merge sort, quicksort, the binary heap, BFS/DFS/
  Dijkstra, KMP, …) implement the same algorithmic structure in each
  language, so cross-language ratios are closer to "language + runtime"
  comparisons.

One deliberate detail: priority-queue variants operate on a **distinct
shuffled key stream** (Fisher–Yates over `0..n−1`), so the pop order is
deterministic and identical across implementations — with duplicate keys,
equal-element order could differ between containers and still be correct,
which would make outputs incomparable.

Dijkstra encodes heap entries as `dist · 2^20 + node`, so heap tie-breaking
on equal distances resolves identically in every language (distances stay
exact while below 2^41).

## Regression verdicts

`GET /api/v1/comparisons?baseline=…&candidate=…` compares two runs. For
each matched (variant, language, size) pair it computes the median delta
(candidate vs baseline) and issues a verdict:

- **INCONCLUSIVE** when `|Δ%|` is below the practical-significance
  threshold (default ±10%, configurable in settings), *or* when `|Δ%|` is
  below the combined run-to-run variation — the pooled CV,
  `sqrt(cv_baseline² + cv_candidate²)`. A change that cannot be
  distinguished from noise is not reported as a regression.
- **REGRESSION / IMPROVEMENT** only when the change exceeds both the
  threshold and the pooled noise.
- **NOT-COMPARABLE** when verification failed on either side.
- **NO-DATA** when the pair is missing on one side.

The report also states comparability: `workload-differs` when any of
(variants, languages, datasetType, inputSizes, seed) differ between runs,
and `environment-differs` when CPU model or core count differ.

## Known limitations

Stated plainly:

- **Shared / virtualized machine.** Timings reflect the recorded environment
  only. The environment snapshot itself notes that the OS-reported CPU may
  be virtualized. These are not canonical performance numbers.
- **The coordinator also serves the web app.** Benchmarks run serially in
  subprocesses, but the Next.js server (and anything else on the host) can
  contend for CPU.
- **JVM single fork.** Each Java job runs in one fresh JVM (`-f 1`). This
  keeps jobs comparable to the other languages (one process, one job) at
  the cost of not averaging over multiple JVM incarnations.
- **PYTHONHASHSEED=0.** Python jobs run with a fixed hash seed for
  reproducibility. Measured ops do not depend on set/dict iteration order,
  but this is a documented environment choice.
- **Modulo bias** in bounded generation (see above) — identical across
  languages, statistically irrelevant for benchmark inputs.
- **Small samples.** With the default 5 repetitions, the 95% t-interval is
  wide (t = 2.776 at df = 4). Confidence intervals are reported; treat
  sub-threshold differences as inconclusive.
- **Environment-specific results are not universal language rankings.** A
  3× C++/Python ratio on this machine for one workload does not generalize
  to other workloads, implementations or machines. The reports repeat this
  limitation, and the AI system prompt forbids presenting results as
  universal rankings.

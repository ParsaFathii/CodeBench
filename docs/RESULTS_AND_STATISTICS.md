# Reading results and statistics

Every CodeBench result is a set of raw observations — one ns/op value per
measured repetition — plus statistics computed from them. This document
explains what each statistic means, when to trust it, and how to read the
charts and badges in the UI.

## The statistics, one by one

All values come from `computeStats()` in `src/lib/bench/stats.ts` and are
computed from the stored `observations` array.

| Statistic | What it is | When to trust it |
|---|---|---|
| `n` | number of raw observations | Everything below is only as good as n. With the default 5 repetitions, expect wide intervals. |
| `min` / `max` | extremes of the observations | Rarely meaningful on their own; `max` is often a scheduling or GC artifact. |
| `mean` | arithmetic mean | Sensitive to outliers, but the basis of the confidence interval. |
| `median` | 50th percentile (R-7 interpolation) | **The headline number.** Robust to outliers; use it for cross-language ratios and regression deltas. |
| `stddev` | sample standard deviation (n − 1 denominator) | Scale of run-to-run spread, in ns. |
| `p5 / p25 / p75 / p95 / p99` | percentiles (R-7, the numpy/pandas default) | Shape of the distribution; `p95`/`p99` expose tail latency from interference (GC, scheduler). |
| `iqr` | p75 − p25 | Middle-spread; basis of the outlier rule. |
| `mad` | median absolute deviation about the median | Outlier-robust alternative to stddev. |
| `cv` | stddev / \|mean\| | Relative spread; the basis of stability classification. |
| `ci95` | 95% t-interval on the mean | See below. |
| `outliersIqr` | observations outside [Q1 − 1.5·IQR, Q3 + 1.5·IQR] | Flagged, **never removed**. |
| `stability` | stable / moderate / unstable | See below. |

### Coefficient of variation

`cv` answers "how noisy was this measurement, relative to its size":

- **CV < 3% — stable.** The median is a solid estimate; 10% cross-language
  differences are real differences on this machine.
- **3% ≤ CV < 10% — moderate.** Usable, but a 10% delta between two
  moderate-CV results may be noise; check the comparison verdict.
- **CV ≥ 10% — unstable.** The coordinator logs a warning when a run
  contains unstable results. Treat the number as a rough indication and
  consider re-running (more repetitions, larger input, quieter machine).

CV is what the regression logic pools across runs: a comparison only claims
REGRESSION/IMPROVEMENT when the median change exceeds both the practical
threshold and `sqrt(cv_baseline² + cv_candidate²)`.

### Confidence intervals with small samples

`ci95` is a two-sided 95% t-interval on the mean:
`mean ± t(df = n−1) · stddev / √n`. With the default 5 repetitions,
t = 2.776 — more than 2.5× the large-sample 1.96 — so the interval is
honest about the uncertainty. Practical consequences:

- Overlapping intervals between two results do not prove equality, and
  non-overlapping ones are decent evidence of a real difference.
- The interval is computed on the *mean*, which includes outliers; the
  median (reported separately) is usually the more robust point estimate.
- Increasing `repetitions` in the experiment config narrows the interval
  roughly as 1/√n.

## How to read the charts

The UI draws its own SVG charts (`src/components/bench/charts.tsx`); no
chart library is involved.

**Scaling curves (log–log).** Runtime (y) against input size (x), both on
logarithmic scales, one line per (variant, language). On log–log axes an
O(n) algorithm is a line of slope 1, O(n log n) slightly steeper, O(n²)
slope 2. This makes complexity behavior directly visible: a curve bending
upward faster than its family's expected slope usually means cache effects
or memory pressure. Compare *slopes and relative positions*, not just
endpoints; the absolute values are environment-specific.

**Comparison bars.** Horizontal bars of the median per (variant, language),
with error whiskers (the CI or spread) around the bar end. The whisker is
the visual cue for "the difference between two bars may be noise": if the
whiskers of two bars overlap heavily, the ranking is not established.
Language colors are fixed throughout the app: C++ amber, Java rose, Python
emerald.

**Distribution strips.** Per result: every raw observation as a dot on a
log-scale axis, a box from Q1 to Q3, a heavy median line, and whiskers to
min/max. This is where outliers become visible — a lone dot far from the
box is the observation that pulled the mean away from the median. A tight
box with no stragglers is what a stable measurement looks like.

**Sparklines.** Small trend lines (used in history/runner contexts) over
recent values; useful for spotting drift across runs, not for precise
reading.

## Verification badges

Each result carries three verification signals:

- `verificationStatus` — `PASSED`, `FAILED`, or `SKIPPED` (skipped when the
  job itself failed before verification).
- `refMatch` — whether the engine's fixed verify-case checksums match the
  TypeScript reference implementation. `false` means the implementation is
  wrong and the timing is meaningless.
- `crossLangMatch` — whether, within the (variant, dataset, size) group,
  all languages produced identical input *and* output checksums.

The **×lang** badge shown next to a result in the Results and Compare views
means `crossLangMatch` is true: input/output checksums match across
languages, so this row is directly comparable with its counterparts in the
other languages. Its absence in a multi-language run means the group failed
cross-language equality and the comparison is invalid.

Failed verification marks the result `FAILED`; comparisons involving such
results return `NOT-COMPARABLE` rows instead of numbers.

## Memory / allocation metrics

Only the Java engine reports an allocation metric: JMH's `gc` profiler
provides `gc.alloc.rate.norm` (bytes allocated per operation), which the
coordinator stores in `extraMetrics` under
`java.gc.alloc.rate.norm_b_per_op`. It is:

- **labelled** as a Java-specific, JMH-provided secondary metric;
- **never compared cross-language** — C++ and Python report no equivalent,
  so any "allocation" comparison would be meaningless;
- still useful within Java: it explains, for example, why the boxed-`Long`
  hash workloads or `ArrayList<Integer>` growth cost what they cost
  relative to primitive-array workloads in the same language.

## Interpreting cross-language ratios

Sanity rules that follow from the methodology:

- Hand-written variants are the cleaner language comparison; standard-
  library variants compare libraries as much as runtimes.
- Ratios are workload- and size-specific; a 3× gap at n=10,000 does not
  extrapolate to n=1,000,000, and gaps often shift with input shape (see
  the five sorting datasets).
- The measured op includes real per-language costs by design (defensive
  copies, container construction, boxed keys where idiomatic). Read the
  measured-op wording in `ALGORITHMS.md` before drawing conclusions.
- Everything is environment-specific: check the run's environment snapshot
  (CPU, cores, load) before quoting numbers elsewhere.

## A worked example

One result row from `GET /api/v1/experiments/{id}/results`:

```json
{
  "variantKey": "sorting.std_sort", "language": "python",
  "inputSize": 10000, "datasetType": "random_int",
  "verificationStatus": "PASSED", "refMatch": true, "crossLangMatch": true,
  "observations": [1785234, 1802111, 1760988, 1923450, 1776120],
  "stats": {
    "n": 5, "min": 1760988, "max": 1923450,
    "mean": 1809580.6, "median": 1785234,
    "stddev": 65403.5, "p5": 1762118, "p25": 1772330,
    "p75": 1843547, "p95": 1908217, "p99": 1920486,
    "iqr": 71217, "mad": 25123,
    "cv": 0.0361, "ci95": [1745069, 1874092],
    "outliersIqr": [], "stability": "moderate"
  }
}
```

How to read it:

- Verification passed and the ×lang badge applies, so this row can be
  compared directly with the `sorting.std_sort` rows of the other languages
  in the same run.
- Median ≈ 1.79 ms per sort; the mean is pulled up by the 1.92 ms
  observation. No IQR outliers, but `p95`/`max` show a tail.
- CV = 3.6% → moderate stability: usable, but a comparison against another
  moderate-CV result should rely on the regression verdict (which pools the
  CVs) rather than the raw ratio alone.
- The CI on the mean is ±~33 µs — roughly ±1.8%. Against a C++ sibling
  result of, say, 190 µs median, the language ratio (~9×) dwarfs both
  intervals and is safely real *on this machine for this workload*.
- The raw `observations` are stored, so any of these numbers can be
  recomputed — nothing here depends on the harness's own aggregation.

## Common pitfalls

- **Comparing standard-library variants as pure language differences.**
  `std_sort` compares `std::sort` vs dual-pivot quicksort vs Timsort —
  different algorithms. Check the `category` field.
- **Reading sub-threshold deltas as regressions.** The comparison endpoint
  exists precisely to fold threshold and pooled CV into the verdict; trust
  `INCONCLUSIVE`.
- **Quoting numbers without the environment.** Every report embeds the
  environment snapshot for this reason; keep them together.
- **Trusting an unverified row.** If `verificationStatus` is not `PASSED`
  or `refMatch` is `false`, the timing is not a measurement of the
  intended algorithm.


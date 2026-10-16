// CodeBench — deterministic statistics over raw observations
//
// All formulas are implemented here once and unit-checked; the AI layer is
// never involved in computing statistics.

import type { Stats } from "./spec";

/** t-distribution two-sided 95% critical values for df = n-1 (df 1..30, then normal approx). */
const T95: number[] = [
  12.706, 4.303, 3.182, 2.776, 2.571, 2.447, 2.365, 2.306, 2.262, 2.228, 2.201, 2.179, 2.16,
  2.145, 2.131, 2.12, 2.11, 2.101, 2.093, 2.086, 2.08, 2.074, 2.069, 2.064, 2.06, 2.056, 2.052,
  2.048, 2.045, 2.042,
];

export function percentile(sortedValues: number[], p: number): number {
  // linear interpolation between closest ranks (R-7, the default in numpy/pandas)
  const n = sortedValues.length;
  if (n === 0) return NaN;
  if (n === 1) return sortedValues[0];
  const idx = (p / 100) * (n - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sortedValues[lo];
  return sortedValues[lo] + (idx - lo) * (sortedValues[hi] - sortedValues[lo]);
}

export function computeStats(observations: number[]): Stats {
  const n = observations.length;
  if (n === 0) {
    return {
      n: 0, min: NaN, max: NaN, mean: NaN, median: NaN, stddev: NaN,
      p5: NaN, p25: NaN, p75: NaN, p95: NaN, p99: NaN, iqr: NaN, mad: NaN,
      cv: NaN, ci95: null, outliersIqr: [], stability: "unstable",
    };
  }
  const sorted = [...observations].sort((a, b) => a - b);
  const min = sorted[0];
  const max = sorted[n - 1];
  const mean = observations.reduce((s, v) => s + v, 0) / n;
  const median = percentile(sorted, 50);
  const p5 = percentile(sorted, 5);
  const p25 = percentile(sorted, 25);
  const p75 = percentile(sorted, 75);
  const p95 = percentile(sorted, 95);
  const p99 = percentile(sorted, 99);
  const iqr = p75 - p25;

  const stddev =
    n < 2
      ? 0
      : Math.sqrt(observations.reduce((s, v) => s + (v - mean) * (v - mean), 0) / (n - 1));

  // median absolute deviation (about the median)
  const absDev = observations.map((v) => Math.abs(v - median)).sort((a, b) => a - b);
  const mad = percentile(absDev, 50);

  const cv = mean !== 0 ? stddev / Math.abs(mean) : 0;

  // 95% CI on the mean (t-interval; small samples need the t critical value)
  let ci95: [number, number] | null = null;
  if (n >= 2) {
    const df = n - 1;
    const t = df <= 30 ? T95[df - 1] : 1.96;
    const half = (t * stddev) / Math.sqrt(n);
    ci95 = [mean - half, mean + half];
  }

  // IQR outlier rule — observations are flagged and retained, never dropped
  const loFence = p25 - 1.5 * iqr;
  const hiFence = p75 + 1.5 * iqr;
  const outliersIqr = observations.filter((v) => v < loFence || v > hiFence);

  const stability: Stats["stability"] = cv < 0.03 ? "stable" : cv < 0.1 ? "moderate" : "unstable";

  return {
    n, min, max, mean, median, stddev, p5, p25, p75, p95, p99, iqr, mad, cv, ci95,
    outliersIqr, stability,
  };
}

export function formatNs(ns: number): string {
  if (!isFinite(ns)) return "—";
  if (ns < 1_000) return `${ns.toFixed(0)} ns`;
  if (ns < 1_000_000) return `${(ns / 1_000).toFixed(2)} µs`;
  if (ns < 1e9) return `${(ns / 1e6).toFixed(2)} ms`;
  return `${(ns / 1e9).toFixed(2)} s`;
}

export function formatPct(x: number, digits = 1): string {
  if (!isFinite(x)) return "—";
  return `${x >= 0 ? "+" : ""}${(x * 100).toFixed(digits)}%`;
}

// CodeBench — shared benchmark domain types
// This module is the single source of truth for the workload/result contract
// shared by the web API, the experiment coordinator and the language runners.

export type Language = "cpp" | "java" | "python";

export const LANGUAGES: Language[] = ["cpp", "java", "python"];

export type ImplementationCategory = "hand-written" | "standard-library";

export type BenchmarkMode = "avgt"; // average time per operation (ns/op)

export type DatasetType =
  | "random_int"
  | "sorted"
  | "reverse_sorted"
  | "nearly_sorted"
  | "duplicate_heavy"
  | "search_mixed"
  | "graph_sparse"
  | "text_corpus"
  | "bounded_matrix";

export const DATASET_LABELS: Record<DatasetType, string> = {
  random_int: "Random integers",
  sorted: "Already sorted",
  reverse_sorted: "Reverse sorted",
  nearly_sorted: "Nearly sorted",
  duplicate_heavy: "Duplicate-heavy",
  search_mixed: "Search hit/miss set",
  graph_sparse: "Sparse random graph",
  text_corpus: "Text search corpus",
  bounded_matrix: "Bounded integer matrix",
};

export type RunStatus =
  | "QUEUED"
  | "PREPARING"
  | "RUNNING"
  | "VERIFYING"
  | "ANALYZING"
  | "COMPLETED"
  | "FAILED"
  | "CANCELLED";

export const RUN_STATUS_ORDER: RunStatus[] = [
  "QUEUED",
  "PREPARING",
  "RUNNING",
  "VERIFYING",
  "ANALYZING",
  "COMPLETED",
];

// ---------------------------------------------------------------------------
// Experiment configuration (stored as JSON on Experiment.config)
// ---------------------------------------------------------------------------

export interface ExperimentConfig {
  /** selected variant ids, e.g. ["sorting.merge_sort", "sorting.std_sort"] */
  variants: string[];
  languages: Language[];
  datasetType: DatasetType;
  inputSizes: number[];
  seed: number;
  warmup: number;
  repetitions: number;
  timeoutMs: number;
  benchmarkMode: BenchmarkMode;
  continueOnError: boolean;
}

export const DEFAULT_CONFIG: ExperimentConfig = {
  variants: ["sorting.merge_sort", "sorting.quick_sort", "sorting.std_sort"],
  languages: ["cpp", "java", "python"],
  datasetType: "random_int",
  inputSizes: [10000],
  seed: 20261016,
  warmup: 2,
  repetitions: 5,
  timeoutMs: 180_000,
  benchmarkMode: "avgt",
  continueOnError: true,
};

// ---------------------------------------------------------------------------
// Job specification — one (variant, language, size) unit of work handed to a runner
// ---------------------------------------------------------------------------

export interface JobSpec {
  runId: string;
  algorithmId: string;
  variantId: string;
  variantKey: string; // "sorting.merge_sort"
  language: Language;
  datasetType: DatasetType;
  inputSize: number;
  seed: number;
  warmup: number;
  repetitions: number;
  minTimeMs: number;
  timeoutMs: number;
}

// ---------------------------------------------------------------------------
// Job result — normalized output of one job (versioned schema)
// ---------------------------------------------------------------------------

export const RESULT_SCHEMA_VERSION = "1.0.0";

export interface JobEnv {
  runtime: string; // "g++ 14.2.0" | "OpenJDK 21.0.2" | "CPython 3.12.15"
  runtimeDetail?: string; // compiler flags / VM options / interpreter detail
  harness: string; // "google-benchmark" | "jmh" | "pyperf"
  harnessVersion: string;
  [k: string]: unknown;
}

export interface VerifyReport {
  inputChecksumHex: string; // FNV-1a 64 over the canonical input encoding
  outputChecksumHex: string; // FNV-1a 64 over the canonical output after one untimed op
  cases: Record<string, string>; // "<dataset>:<n>" -> output checksum (fixed verify inputs)
}

export interface JobResult {
  schemaVersion: string;
  language: Language;
  algorithmId: string;
  variantId: string;
  datasetType: DatasetType;
  inputSize: number;
  seed: number;
  harness: string;
  harnessVersion: string;
  benchmarkMode: BenchmarkMode;
  warmup: number;
  repetitions: number;
  /** raw observations: ns per operation, one per measured repetition */
  observations: number[];
  verify: VerifyReport;
  env: JobEnv;
  rawOutput: string; // preserved harness output (JSON from GB/JMH/pyperf)
  extraMetrics?: Record<string, number>;
  warnings: string[];
  durationMs: number;
}

// ---------------------------------------------------------------------------
// Statistics (deterministic, computed from observations)
// ---------------------------------------------------------------------------

export interface Stats {
  n: number;
  min: number;
  max: number;
  mean: number;
  median: number;
  stddev: number; // sample standard deviation (n-1)
  p5: number;
  p25: number;
  p75: number;
  p95: number;
  p99: number;
  iqr: number;
  mad: number; // median absolute deviation
  cv: number; // coefficient of variation (stddev / mean)
  ci95: [number, number] | null; // 95% t-interval on the mean (null when n < 2)
  outliersIqr: number[]; // observations outside [Q1-1.5*IQR, Q3+1.5*IQR] (retained, never dropped)
  stability: "stable" | "moderate" | "unstable";
}

// ---------------------------------------------------------------------------
// Comparison / regression analysis
// ---------------------------------------------------------------------------

export interface ComparisonRow {
  algorithmId: string;
  variantId: string;
  variantKey: string;
  language: Language;
  inputSize: number;
  datasetType: string;
  baselineMedian: number | null; // ns/op
  candidateMedian: number | null; // ns/op
  deltaPct: number | null; // % change of candidate vs baseline (positive = slower)
  ratio: number | null; // candidate / baseline
  baselineCV: number | null;
  candidateCV: number | null;
  combinedCV: number | null;
  verdict: "REGRESSION" | "IMPROVEMENT" | "INCONCLUSIVE" | "NO-DATA" | "NOT-COMPARABLE";
  note?: string;
}

export interface ComparisonReport {
  baselineRunId: string;
  candidateRunId: string;
  comparability: "comparable" | "workload-differs" | "environment-differs";
  comparabilityNotes: string[];
  regressionThresholdPct: number; // practical significance threshold
  rows: ComparisonRow[];
  generatedAt: string;
}

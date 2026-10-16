// CodeBench — typed API client (frontend)
import type { ExperimentConfig, Language, Stats } from "@/lib/bench/spec";

export interface CatalogEntryDto {
  variantKey: string;
  algorithmId: string;
  algorithmName: string;
  variantId: string;
  variantName: string;
  category: "hand-written" | "standard-library";
  categoryGroup: string;
  languages: Language[];
  complexity: string;
  description: string;
  measuredOp: string;
  notes?: string;
  datasets: string[];
  defaultDataset: string;
  defaultSizes: number[];
  maxSize?: number;
  outputContract: string;
}

export interface EngineAvailabilityDto {
  language: Language;
  available: boolean;
  runtime: string | null;
  harness: string;
  harnessVersion: string | null;
  detail: string;
}

export interface ExperimentDto {
  id: string;
  name: string;
  description: string | null;
  config: ExperimentConfig;
  createdAt: string;
  runCount: number;
  lastRun: { id: string; status: string; createdAt: string; progress: number } | null;
}

export interface RunDto {
  id: string;
  experimentId: string;
  experimentName: string;
  config: ExperimentConfig;
  status: string;
  progress: number;
  totalJobs: number;
  completedJobs: number;
  failedJobs: number;
  currentJob: string | null;
  resultCount: number;
  commitSha: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
  error: string | null;
}

export interface RunLogDto {
  id: string;
  ts: string;
  level: string;
  message: string;
}

export interface ResultDto {
  id: string;
  runId: string;
  variantKey: string;
  algorithmId: string;
  algorithmName: string;
  variantId: string;
  variantName: string;
  category: string;
  language: Language;
  datasetType: string;
  inputSize: number;
  seed: number;
  harness: string;
  harnessVersion: string | null;
  verificationStatus: string;
  refMatch: boolean | null;
  crossLangMatch: boolean;
  status: string;
  observations: number[];
  stats: Stats | null;
  extraMetrics: Record<string, number> | null;
  env: { runtime?: string; runtimeDetail?: string; harness?: string; harnessVersion?: string } | null;
  warnings: string | null;
  durationMs: number | null;
  error: string | null;
  createdAt: string;
}

export interface EnvSnapshotDto {
  id: string;
  capturedAt: string;
  osPlatform: string;
  osVersion: string;
  arch: string;
  cpuModel: string | null;
  cpuCores: number | null;
  totalMemBytes: string | null;
  hostRuntime: string | null;
  commitSha: string | null;
  metadataJson: string;
}

export interface EnvironmentDto {
  environment: {
    osPlatform: string;
    osVersion: string;
    arch: string;
    cpuModel: string | null;
    cpuCores: number | null;
    totalMemBytes: string | null;
    hostRuntime: string | null;
    commitSha: string | null;
    capturedAt: string;
    metadata: { nodeVersion: string | null; loadavg: number[] | null; isolationPolicy: string; notes: string[] };
  };
  engines: EngineAvailabilityDto[];
}

export interface AiStatusDto {
  configured: string;
  provider: string;
  available: boolean;
  model: string | null;
  detail: string;
  note: string;
}

export interface AiAnalysisDto {
  id: string;
  runId: string;
  provider: string;
  model: string | null;
  status: string;
  output: {
    summary: string;
    observed_findings: string[];
    supporting_run_ids: string[];
    statistical_evidence: string[];
    limitations: string[];
    possible_explanations: string[];
    recommended_experiments: string[];
    confidence: string;
  } | null;
  error: string | null;
  createdAt: string;
}

export interface ComparisonRowDto {
  algorithmId: string;
  variantId: string;
  variantKey: string;
  language: Language;
  inputSize: number;
  datasetType: string;
  baselineMedian: number | null;
  candidateMedian: number | null;
  deltaPct: number | null;
  ratio: number | null;
  baselineCV: number | null;
  candidateCV: number | null;
  combinedCV: number | null;
  verdict: string;
  note?: string;
}

export interface ComparisonDto {
  baselineRunId: string;
  candidateRunId: string;
  comparability: string;
  comparabilityNotes: string[];
  regressionThresholdPct: number;
  rows: ComparisonRowDto[];
  generatedAt: string;
}

export interface SettingsDto {
  ai: { provider: "disabled" | "zai" | "ollama"; model: string | null; ollamaUrl: string | null; temperature: number };
  defaults: { warmup: number; repetitions: number; timeoutMs: number; seed: number };
  regressionThresholdPct: number;
}

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = (await res.json()) as { error?: string; details?: string[] };
      detail = [body.error, ...(body.details ?? [])].filter(Boolean).join(" — ") || detail;
    } catch {
      /* keep statusText */
    }
    throw new Error(detail);
  }
  return (await res.json()) as T;
}

export const api = {
  catalog: () =>
    fetch("/api/v1/algorithms").then((r) => json<{ catalog: CatalogEntryDto[]; workloadSpecVersion: string }>(r)),
  languages: () =>
    fetch("/api/v1/languages").then((r) =>
      json<{ languages: Array<{ id: Language; name: string; standard: string; harness: string }>; engines: EngineAvailabilityDto[] }>(r)
    ),
  experiments: () => fetch("/api/v1/experiments").then((r) => json<{ experiments: ExperimentDto[] }>(r)),
  createExperiment: (name: string, description: string | null, config: ExperimentConfig) =>
    fetch("/api/v1/experiments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, description, config }),
    }).then((r) => json<{ id: string }>(r)),
  experiment: (id: string) =>
    fetch(`/api/v1/experiments/${id}`).then((r) =>
      json<{ id: string; name: string; description: string | null; config: ExperimentConfig; createdAt: string; runs: RunDto[] }>(r)
    ),
  cloneExperiment: (id: string) =>
    fetch(`/api/v1/experiments/${id}/clone`, { method: "POST" }).then((r) => json<{ id: string }>(r)),
  runExperiment: (id: string) =>
    fetch(`/api/v1/experiments/${id}/run`, { method: "POST" }).then((r) => json<{ runId: string }>(r)),
  cancelExperiment: (id: string) =>
    fetch(`/api/v1/experiments/${id}/cancel`, { method: "POST" }).then((r) => json<{ cancelled: boolean }>(r)),
  experimentResults: (id: string) =>
    fetch(`/api/v1/experiments/${id}/results`).then((r) => json<{ results: ResultDto[] }>(r)),
  runs: () => fetch("/api/v1/runs").then((r) => json<{ activeRunId: string | null; runs: RunDto[] }>(r)),
  run: (id: string, afterLogId?: string) =>
    fetch(`/api/v1/runs/${id}${afterLogId ? `?afterLogId=${afterLogId}` : ""}`).then((r) =>
      json<{
        id: string;
        experimentId: string;
        experimentName: string;
        config: ExperimentConfig;
        status: string;
        progress: number;
        totalJobs: number;
        completedJobs: number;
        failedJobs: number;
        currentJob: string | null;
        commitSha: string | null;
        startedAt: string | null;
        finishedAt: string | null;
        createdAt: string;
        error: string | null;
        logs: RunLogDto[];
        results: ResultDto[];
        environment: EnvSnapshotDto | null;
      }>(r)
    ),
  rawIndex: (runId: string) =>
    fetch(`/api/v1/runs/${runId}/raw`).then((r) =>
      json<{ rawResults: Array<{ id: string; label: string; harness: string }> }>(r)
    ),
  rawResult: (runId: string, resultId: string) =>
    fetch(`/api/v1/runs/${runId}/raw?resultId=${resultId}`).then((r) =>
      json<{ id: string; label: string; harness: string; harnessVersion: string | null; env: Record<string, unknown> | null; observations: number[]; rawOutput: string | null }>(r)
    ),
  comparison: (baseline: string, candidate: string) =>
    fetch(`/api/v1/comparisons?baseline=${baseline}&candidate=${candidate}`).then((r) => json<ComparisonDto>(r)),
  reports: (runId: string) =>
    fetch(`/api/v1/reports?runId=${runId}`).then((r) =>
      json<{ reports: Array<{ id: string; format: string; filename: string; createdAt: string }> }>(r)
    ),
  generateReport: (runId: string, format: string) =>
    fetch("/api/v1/reports", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ runId, format }),
    }).then((r) => json<{ id: string; filename: string; content: string }>(r)),
  downloadReport: (runId: string, reportId: string) => {
    window.open(`/api/v1/reports?runId=${runId}&download=${reportId}`, "_blank");
  },
  aiStatus: () => fetch("/api/v1/ai/status").then((r) => json<AiStatusDto>(r)),
  aiAnalyses: (runId: string) =>
    fetch(`/api/v1/ai/analysis?runId=${runId}`).then((r) => json<{ analyses: AiAnalysisDto[] }>(r)),
  runAiAnalysis: (runId: string) =>
    fetch("/api/v1/ai/analysis", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ runId }),
    }).then((r) => json<{ analysisId: string }>(r)),
  environment: () => fetch("/api/v1/environment").then((r) => json<EnvironmentDto>(r)),
  settings: () =>
    fetch("/api/v1/settings").then((r) => json<{ settings: SettingsDto; defaults: SettingsDto }>(r)),
  saveSettings: (settings: Partial<SettingsDto>) =>
    fetch("/api/v1/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(settings),
    }).then((r) => json<{ settings: SettingsDto }>(r)),
};

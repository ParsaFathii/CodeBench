// CodeBench — experiment coordinator
//
// Owns the experiment queue and the execution lifecycle:
//   QUEUED -> PREPARING -> RUNNING -> VERIFYING -> ANALYZING -> COMPLETED/FAILED/CANCELLED
//
// Isolation policy: benchmark jobs run strictly serially, each in its own
// operating-system process (Google Benchmark / JMH / pyperf), so heavy
// measurements never overlap on the same machine and never block API
// requests (execution happens in background async tasks, state lives in
// SQLite, progress comes from real job completions).

import { db } from "@/lib/db";
import type { ExperimentConfig, JobResult, JobSpec, Language } from "./spec";
import { computeStats } from "./stats";
import { findVariant } from "./registry";
import { runReference, verifyCasesFor, VERIFY_SEED } from "./reference";
import { runCppJob } from "./engines/cpp";
import { runJavaJob } from "./engines/java";
import { runPythonJob } from "./engines/python";
import { captureEnvironment } from "./env";

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export interface ConfigValidation {
  valid: boolean;
  errors: string[];
  warnings: string[];
  totalJobs: number;
}

export function validateConfig(config: ExperimentConfig): ConfigValidation {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!config.variants?.length) errors.push("Select at least one algorithm variant.");
  if (!config.languages?.length) errors.push("Select at least one language.");
  if (!config.inputSizes?.length) errors.push("Select at least one input size.");
  if (config.warmup < 0) errors.push("Warm-up count must be zero or more.");
  if (config.repetitions < 2) errors.push("At least 2 measured repetitions are required for run-to-run statistics.");
  if (config.timeoutMs < 10_000) errors.push("Timeout must be at least 10 seconds.");
  if (!Number.isInteger(config.seed)) errors.push("Seed must be an integer.");

  for (const key of config.variants ?? []) {
    const found = findVariant(key);
    if (!found) {
      errors.push(`Unknown variant "${key}".`);
      continue;
    }
    if (!found.variant.languages.some((l) => (config.languages ?? []).includes(l))) {
      warnings.push(
        `${found.variant.name} is not available in any of the selected languages and will be skipped.`
      );
    }
    if (!found.algorithm.datasets.includes(config.datasetType)) {
      errors.push(
        `${found.algorithm.name} does not support dataset "${config.datasetType}" (supported: ${found.algorithm.datasets.join(", ")}).`
      );
    }
    const maxSize = found.variant.maxSize;
    if (maxSize && (config.inputSizes ?? []).some((s) => s > maxSize)) {
      errors.push(`${found.variant.name} supports input sizes up to ${maxSize}.`);
    }
  }
  for (const size of config.inputSizes ?? []) {
    if (!Number.isInteger(size) || size < 8 || size > 2_000_000) {
      errors.push(`Input size ${size} is out of the supported range (8..2,000,000).`);
    }
  }

  const applicable = (config.variants ?? []).filter((key) => {
    const found = findVariant(key);
    return found && found.variant.languages.some((l) => (config.languages ?? []).includes(l));
  });
  const totalJobs = applicable.length * (config.languages?.length ?? 0) * (config.inputSizes?.length ?? 0);

  return { valid: errors.length === 0, errors, warnings, totalJobs };
}

// ---------------------------------------------------------------------------
// Coordinator singleton (survives Next.js module reloads via globalThis)
// ---------------------------------------------------------------------------

interface RunningChild {
  kill: () => void;
}

interface CoordinatorState {
  activeRunId: string | null;
  cancelRequested: Set<string>;
  runningJobs: Map<string, RunningChild>;
  queueBusy: boolean;
}

const globalForCoordinator = globalThis as unknown as {
  __codebenchCoordinator?: CoordinatorState;
};

const state: CoordinatorState =
  globalForCoordinator.__codebenchCoordinator ??
  (globalForCoordinator.__codebenchCoordinator = {
    activeRunId: null,
    cancelRequested: new Set(),
    runningJobs: new Map(),
    queueBusy: false,
  });

async function log(runId: string, level: string, message: string) {
  await db.runLog.create({ data: { runId, level, message: message.slice(0, 2000) } });
}

/** Mark runs that were interrupted by a server restart as failed (honest state repair). */
export async function repairStaleRuns(): Promise<void> {
  const stale = await db.run.findMany({
    where: { status: { in: ["QUEUED", "PREPARING", "RUNNING", "VERIFYING", "ANALYZING"] } },
  });
  for (const run of stale) {
    if (run.id === state.activeRunId) continue;
    await db.run.update({
      where: { id: run.id },
      data: {
        status: "FAILED",
        error: "Execution was interrupted (coordinator restarted). Re-run the experiment to obtain fresh measurements.",
        finishedAt: new Date(),
      },
    });
  }
}

// ---------------------------------------------------------------------------
// Run lifecycle
// ---------------------------------------------------------------------------

export async function startRun(experimentId: string): Promise<{ runId: string }> {
  const experiment = await db.experiment.findUnique({ where: { id: experimentId } });
  if (!experiment) throw new Error("experiment not found");
  const config = JSON.parse(experiment.config) as ExperimentConfig;
  const validation = validateConfig(config);
  if (!validation.valid) throw new Error(`invalid experiment configuration: ${validation.errors.join(" ")}`);

  if (state.activeRunId) {
    const active = await db.run.findUnique({ where: { id: state.activeRunId } });
    if (active && ["QUEUED", "PREPARING", "RUNNING", "VERIFYING", "ANALYZING"].includes(active.status)) {
      throw new Error(
        `another run is currently executing (${active.id.slice(-6)}); benchmarks run serially — wait for it to finish or cancel it first`
      );
    }
  }

  const env = await captureEnvironment(null);
  const envSnap = await db.envSnapshot.create({
    data: {
      osPlatform: env.osPlatform,
      osVersion: env.osVersion,
      arch: env.arch,
      cpuModel: env.cpuModel,
      cpuCores: env.cpuCores,
      totalMemBytes: env.totalMemBytes,
      hostRuntime: env.hostRuntime,
      commitSha: env.commitSha,
      capturedAt: new Date(env.capturedAt),
      metadataJson: JSON.stringify(env.metadata),
    },
  });

  const run = await db.run.create({
    data: {
      experimentId,
      status: "QUEUED",
      totalJobs: validation.totalJobs,
      envSnapshotId: envSnap.id,
      commitSha: env.commitSha,
      startedAt: new Date(),
    },
  });

  await log(run.id, "info", `Run queued: ${validation.totalJobs} benchmark jobs (${config.variants.length} variants × ${config.languages.length} languages × ${config.inputSizes.length} sizes).`);
  if (validation.warnings.length) {
    for (const w of validation.warnings) await log(run.id, "warn", w);
  }
  void executeRun(run.id); // background — API returns immediately
  return { runId: run.id };
}

export async function requestCancel(runId: string): Promise<boolean> {
  const run = await db.run.findUnique({ where: { id: runId } });
  if (!run) return false;
  if (!["QUEUED", "PREPARING", "RUNNING", "VERIFYING", "ANALYZING"].includes(run.status)) return false;
  state.cancelRequested.add(runId);
  await log(runId, "warn", "Cancellation requested — stopping after the current job is terminated.");
  return true;
}

function buildJobs(runId: string, config: ExperimentConfig): JobSpec[] {
  const jobs: JobSpec[] = [];
  for (const size of config.inputSizes) {
    for (const key of config.variants) {
      const found = findVariant(key);
      if (!found) continue;
      for (const language of config.languages) {
        if (!found.variant.languages.includes(language)) continue;
        jobs.push({
          runId,
          algorithmId: found.algorithm.id,
          variantId: found.variant.id,
          variantKey: key,
          language,
          datasetType: config.datasetType,
          inputSize: size,
          seed: config.seed,
          warmup: config.warmup,
          repetitions: config.repetitions,
          minTimeMs: 50,
          timeoutMs: config.timeoutMs,
        });
      }
    }
  }
  return jobs;
}

async function executeRun(runId: string): Promise<void> {
  if (state.queueBusy) {
    await db.run.update({
      where: { id: runId },
      data: { status: "FAILED", error: "coordinator busy", finishedAt: new Date() },
    });
    return;
  }
  state.queueBusy = true;
  state.activeRunId = runId;
  try {
    await doExecuteRun(runId);
  } catch (err) {
    await db.run
      .update({
        where: { id: runId },
        data: {
          status: "FAILED",
          error: err instanceof Error ? err.message : String(err),
          finishedAt: new Date(),
        },
      })
      .catch(() => undefined);
    await log(runId, "error", `Run failed: ${err instanceof Error ? err.message : String(err)}`).catch(
      () => undefined
    );
  } finally {
    state.queueBusy = false;
    state.activeRunId = null;
    state.cancelRequested.delete(runId);
  }
}

async function doExecuteRun(runId: string): Promise<void> {
  const run = await db.run.findUnique({ where: { id: runId }, include: { experiment: true } });
  if (!run) throw new Error("run not found");
  const config = JSON.parse(run.experiment.config) as ExperimentConfig;
  const jobs = buildJobs(runId, config);

  // ---- PREPARING: compile engines up front so failures surface early ----
  await db.run.update({ where: { id: runId }, data: { status: "PREPARING" } });
  await log(runId, "info", "Preparing engines (compile C++/Java if sources changed)…");
  const prepErrors: string[] = [];
  const { ensureCppCompiled } = await import("./engines/cpp");
  const { ensureJavaCompiled } = await import("./engines/java");
  if (config.languages.includes("cpp")) {
    try {
      await ensureCppCompiled();
      await log(runId, "success", "C++ engine ready (g++ -std=c++20 -O2 + Google Benchmark).");
    } catch (e) {
      prepErrors.push(`C++: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  if (config.languages.includes("java")) {
    try {
      await ensureJavaCompiled();
      await log(runId, "success", "Java engine ready (javac + JMH annotation processing).");
    } catch (e) {
      prepErrors.push(`Java: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  for (const e of prepErrors) await log(runId, "error", `Engine preparation failed — ${e}`);

  if (state.cancelRequested.has(runId)) {
    await db.run.update({ where: { id: runId }, data: { status: "CANCELLED", finishedAt: new Date() } });
    await log(runId, "warn", "Run cancelled during preparation.");
    return;
  }

  // ---- RUNNING ----
  await db.run.update({ where: { id: runId }, data: { status: "RUNNING" } });
  let completed = 0;
  let failed = 0;
  const results: Array<{ jobId: string; result: JobResult }> = [];

  for (const job of jobs) {
    if (state.cancelRequested.has(runId)) break;
    if (prepErrors.some((e) => e.startsWith(capitalize(job.language)))) {
      // engine failed to prepare — record failure for its jobs
      await storeFailedResult(runId, job, `engine unavailable: ${prepErrors.find((e) => e.startsWith(capitalize(job.language)))}`);
      failed++;
      completed++;
      await updateProgress(runId, completed, jobs.length, job);
      continue;
    }

    await db.run.update({
      where: { id: runId },
      data: { currentJob: `${job.variantKey} · ${job.language} · n=${job.inputSize}` },
    });
    await log(
      runId,
      "info",
      `▶ ${job.variantKey} [${job.language}] n=${job.inputSize} dataset=${job.datasetType} seed=${job.seed} (warmup ${job.warmup}, reps ${job.repetitions})`
    );

    try {
      const result = await runJob(job, runId);
      await storeResult(runId, job, result);
      results.push({ jobId: `${job.variantKey}|${job.language}|${job.inputSize}`, result });
      completed++;
      await log(
        runId,
        "success",
        `✓ ${job.variantKey} [${job.language}] n=${job.inputSize} — median ${formatShortNs(
          median(result.observations)
        )} over ${result.observations.length} observations`
      );
    } catch (err) {
      failed++;
      completed++;
      const msg = err instanceof Error ? err.message : String(err);
      await storeFailedResult(runId, job, msg);
      await log(runId, "error", `✗ ${job.variantKey} [${job.language}] n=${job.inputSize} — ${msg}`);
      if (!config.continueOnError) {
        await db.run.update({
          where: { id: runId },
          data: {
            status: "FAILED",
            error: `job failed and continueOnError is disabled: ${msg}`,
            finishedAt: new Date(),
            completedJobs: completed,
            failedJobs: failed,
          },
        });
        return;
      }
    }
    await updateProgress(runId, completed, jobs.length, job);
  }

  if (state.cancelRequested.has(runId)) {
    await db.run.update({
      where: { id: runId },
      data: { status: "CANCELLED", finishedAt: new Date(), completedJobs: completed, failedJobs: failed },
    });
    await log(runId, "warn", `Run cancelled after ${completed}/${jobs.length} jobs.`);
    return;
  }

  // ---- VERIFYING: reference + cross-language checksum comparison ----
  await db.run.update({ where: { id: runId }, data: { status: "VERIFYING", currentJob: null } });
  await log(runId, "info", "Verifying outputs against the TypeScript reference and across languages…");
  const verification = await verifyRun(runId);
  for (const v of verification.notes) await log(runId, v.level, v.message);

  // ---- ANALYZING: statistics (already per-result) + overall stability ----
  await db.run.update({ where: { id: runId }, data: { status: "ANALYZING" } });
  const unstable = verification.unstableResults;
  if (unstable.length > 0) {
    await log(
      runId,
      "warn",
      `Coefficient of variation above 10% for ${unstable.length} result(s): raw observations are retained; treat these measurements as unstable and consider re-running.`
    );
  }

  const finalStatus = failed >= jobs.length ? "FAILED" : "COMPLETED";
  await db.run.update({
    where: { id: runId },
    data: {
      status: finalStatus,
      finishedAt: new Date(),
      completedJobs: completed,
      failedJobs: failed,
      progress: 100,
      error:
        failed > 0 && finalStatus === "COMPLETED"
          ? `${failed} of ${jobs.length} jobs failed (see logs/results)`
          : failed >= jobs.length
            ? "all jobs failed"
            : null,
    },
  });
  await log(
    runId,
    finalStatus === "COMPLETED" ? "success" : "error",
    `Run ${finalStatus.toLowerCase()} — ${completed}/${jobs.length} jobs, ${failed} failed.`
  );
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

function formatShortNs(ns: number): string {
  if (ns < 1e3) return `${ns.toFixed(0)}ns`;
  if (ns < 1e6) return `${(ns / 1e3).toFixed(1)}µs`;
  if (ns < 1e9) return `${(ns / 1e6).toFixed(1)}ms`;
  return `${(ns / 1e9).toFixed(2)}s`;
}

async function updateProgress(runId: string, completed: number, total: number, job: JobSpec) {
  const progress = total > 0 ? Math.round((completed / total) * 100) : 0;
  await db.run.update({
    where: { id: runId },
    data: { progress, completedJobs: completed },
  });
}

async function runJob(job: JobSpec, runId: string): Promise<JobResult> {
  switch (job.language) {
    case "cpp":
      return runCppJob(job);
    case "java":
      return runJavaJob(job);
    case "python":
      return runPythonJob(job);
    default:
      throw new Error(`unsupported language ${job.language satisfies never}`);
  }
}

async function storeResult(runId: string, job: JobSpec, result: JobResult) {
  const found = findVariant(job.variantKey)!;
  const stats = computeStats(result.observations);
  await db.benchmarkResult.create({
    data: {
      runId,
      algorithmId: found.algorithm.id,
      algorithmName: found.algorithm.name,
      variantId: found.variant.id,
      variantName: found.variant.name,
      category: found.variant.category,
      language: job.language,
      datasetType: job.datasetType,
      inputSize: job.inputSize,
      seed: job.seed,
      harness: result.harness,
      harnessVersion: result.harnessVersion,
      benchmarkMode: result.benchmarkMode,
      warmupIterations: result.warmup,
      measuredRepetitions: result.repetitions,
      verificationStatus: "PENDING", // finalized in verifyRun()
      inputChecksumHex: result.verify.inputChecksumHex || null,
      casesJson: JSON.stringify(result.verify.cases),
      jobChecksumHex: result.verify.outputChecksumHex || null,
      observations: JSON.stringify(result.observations),
      statsJson: JSON.stringify(stats),
      rawOutput: result.rawOutput.slice(0, 400_000), // keep raw audit trail bounded
      envJson: JSON.stringify(result.env),
      extraMetricsJson: result.extraMetrics ? JSON.stringify(result.extraMetrics) : null,
      warnings: result.warnings.length ? result.warnings.join("; ") : null,
      durationMs: result.durationMs,
      status: "COMPLETED",
    },
  });
}

async function storeFailedResult(runId: string, job: JobSpec, error: string) {
  const found = findVariant(job.variantKey);
  if (!found) return;
  await db.benchmarkResult.create({
    data: {
      runId,
      algorithmId: found.algorithm.id,
      algorithmName: found.algorithm.name,
      variantId: found.variant.id,
      variantName: found.variant.name,
      category: found.variant.category,
      language: job.language,
      datasetType: job.datasetType,
      inputSize: job.inputSize,
      seed: job.seed,
      harness: job.language === "cpp" ? "google-benchmark" : job.language === "java" ? "jmh" : "pyperf",
      benchmarkMode: "avgt",
      verificationStatus: "SKIPPED",
      observations: "[]",
      status: error.toLowerCase().includes("timed out") ? "TIMEOUT" : "FAILED",
      error: error.slice(0, 4000),
    },
  });
}

// ---------------------------------------------------------------------------
// Verification — reference implementation + cross-language equality
// ---------------------------------------------------------------------------

interface VerificationNote {
  level: "info" | "success" | "warn" | "error";
  message: string;
}

export async function verifyRun(runId: string): Promise<{ notes: VerificationNote[]; unstableResults: string[] }> {
  const notes: VerificationNote[] = [];
  const rows = await db.benchmarkResult.findMany({ where: { runId, status: "COMPLETED" } });

  // 1) fixed verify cases must match the TypeScript reference implementation
  const referenceCache = new Map<string, Record<string, string>>();
  for (const row of rows) {
    const variantKey = `${row.algorithmId}.${row.variantId}`;
    let reference = referenceCache.get(variantKey);
    if (!reference) {
      try {
        const cases = verifyCasesFor(variantKey);
        const ref: Record<string, string> = {};
        for (const c of cases) {
          const r = runReference(variantKey, c.dataset, c.n, VERIFY_SEED);
          ref[c.key] = r.outputChecksumHex;
        }
        reference = ref;
      } catch {
        reference = {};
      }
      referenceCache.set(variantKey, reference);
    }
    const engineCases: Record<string, string> = row.casesJson
      ? (JSON.parse(row.casesJson) as Record<string, string>)
      : {};
    let refMatch: boolean | null = null;
    if (Object.keys(reference).length === 0) {
      refMatch = null; // reference unavailable for this variant — reported, not invented
    } else {
      refMatch = Object.entries(reference).every(
        ([k, v]) => engineCases[k] === v
      );
    }
    await db.benchmarkResult.update({ where: { id: row.id }, data: { refMatch } });
    if (refMatch === false) {
      notes.push({
        level: "error",
        message: `Reference verification FAILED for ${variantKey} [${row.language}] — the engine's fixed-case checksums do not match the TypeScript reference. The result is marked invalid.`,
      });
    }
  }

  // 2) cross-language equivalence groups on the same (variant, dataset, size)
  const groups = new Map<string, typeof rows>();
  for (const row of rows) {
    const key = `${row.algorithmId}.${row.variantId}|${row.datasetType}|${row.inputSize}`;
    const list = groups.get(key) ?? [];
    list.push(row);
    groups.set(key, list);
  }

  const unstable: string[] = [];
  let allPassed = true;

  for (const [key, group] of groups) {
    const variantKey = key.split("|")[0];
    const langCount = new Set(group.map((r) => r.language)).size;
    let groupOk = true;

    if (langCount > 1) {
      const inputChecksums = new Set(group.map((r) => r.inputChecksumHex ?? ""));
      const outputChecksums = new Set(group.map((r) => r.jobChecksumHex ?? ""));
      if (inputChecksums.size > 1 || inputChecksums.has("")) {
        groupOk = false;
        notes.push({
          level: "error",
          message: `Input checksums differ across languages for ${variantKey} n=${group[0].inputSize} — inputs are NOT logically equivalent; the comparison is invalid.`,
        });
      }
      if (outputChecksums.size > 1 || outputChecksums.has("")) {
        groupOk = false;
        notes.push({
          level: "error",
          message: `Output checksums differ across languages for ${variantKey} n=${group[0].inputSize} — implementations diverge; the comparison is invalid.`,
        });
      }
    }

    for (const row of group) {
      const rowRef = await db.benchmarkResult.findUnique({ where: { id: row.id } });
      const refMatch = rowRef?.refMatch ?? null;
      const status =
        refMatch === false || !groupOk ? "FAILED" : refMatch === null ? "PASSED" : "PASSED";
      if (status === "FAILED") allPassed = false;
      await db.benchmarkResult.update({
        where: { id: row.id },
        data: { verificationStatus: status, crossLangMatch: groupOk && langCount > 1 },
      });
      const stats = row.statsJson ? (JSON.parse(row.statsJson) as { stability?: string }) : null;
      if (stats?.stability === "unstable") {
        unstable.push(`${variantKey} [${row.language}] n=${row.inputSize}`);
      }
    }
  }

  const langs = new Set(rows.map((r) => r.language)).size;
  notes.unshift({
    level: allPassed ? "success" : "error",
    message: allPassed
      ? `Verification: all ${rows.length} results satisfy the reference contract${langs > 1 ? " and inputs/outputs are consistent across languages" : " (single-language run)"}.`
      : "Verification FAILED for at least one group — affected results are marked FAILED and must not be treated as valid measurements.",
  });

  return { notes, unstableResults: unstable };
}

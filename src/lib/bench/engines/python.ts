// CodeBench — Python engine wrapper: execute one job under pyperf

import { existsSync, mkdirSync, readFileSync } from "fs";
import path from "path";
import type { JobResult, JobSpec } from "../spec";
import { RESULT_SCHEMA_VERSION } from "../spec";
import { PYTHON_BENCH, TMP_DIR, pyperfVersion, pythonVersion } from "./paths";
import { readVerifySidecar, spawnIsolated } from "./cpp";

interface PyperfJson {
  version?: number;
  benchmarks?: Array<{
    runs?: Array<{
      values?: number[];
    }>;
  }>;
}

export async function runPythonJob(job: JobSpec): Promise<JobResult> {
  const started = Date.now();
  mkdirSync(TMP_DIR, { recursive: true });
  const workDir = path.join(TMP_DIR, `py-${job.runId}-${job.algorithmId}-${job.variantId}-${job.inputSize}`);
  mkdirSync(workDir, { recursive: true });
  const verifyFile = path.join(workDir, "verify.json");
  const perfFile = path.join(workDir, "pyperf.json");

  const env: NodeJS.ProcessEnv = {
    ...process.env,
    CB_VARIANT: job.variantId,
    CB_DATASET: job.datasetType,
    CB_SIZE: String(job.inputSize),
    CB_SEED: String(job.seed),
    CB_VERIFY_OUT: verifyFile,
    PYTHONHASHSEED: "0", // reproducible hashing environment (documented limitation for set/dict iteration — unused in measured ops)
  };

  const outcome = await spawnIsolated(
    "python3",
    [
      PYTHON_BENCH,
      "-o",
      perfFile,
      "-p",
      "1", // single worker process: one job, one process, serial isolation
      "-n",
      String(Math.max(1, job.repetitions)),
      "-w",
      String(Math.max(0, job.warmup)),
      "--min-time",
      (Math.max(10, job.minTimeMs) / 1000).toFixed(3),
      // pyperf workers do NOT inherit custom env by default — without this
      // the timed op would silently fall back to default job parameters.
      "--inherit-environ",
      "CB_VARIANT,CB_DATASET,CB_SIZE,CB_SEED,PYTHONHASHSEED",
    ],
    env,
    job.timeoutMs
  );

  const warnings: string[] = [];
  if (outcome.timedOut) throw new Error(`Python job timed out after ${job.timeoutMs} ms`);
  if (outcome.code !== 0) {
    throw new Error(
      `pyperf exited with code ${outcome.code}: ${outcome.stderr.slice(0, 2000) || "(no stderr)"}`
    );
  }

  let observations: number[] = [];
  let rawOutput = "";
  if (existsSync(perfFile)) {
    rawOutput = readFileSync(perfFile, "utf8");
    const perf = JSON.parse(rawOutput) as PyperfJson;
    const values = (perf.benchmarks ?? []).flatMap((b) =>
      (b.runs ?? []).flatMap((r) => r.values ?? [])
    );
    observations = values
      .filter((v) => typeof v === "number" && isFinite(v) && v > 0)
      .map((sec) => sec * 1e9); // seconds per op -> ns per op
  } else {
    warnings.push("pyperf JSON output file missing");
  }
  if (observations.length === 0) throw new Error("no observations collected from pyperf");

  const verify = existsSync(verifyFile) ? readVerifySidecar(verifyFile) : null;
  if (!verify) warnings.push("verification sidecar missing");

  const py = await pythonVersion();
  const pyperfV = await pyperfVersion();

  return {
    schemaVersion: RESULT_SCHEMA_VERSION,
    language: "python",
    algorithmId: job.algorithmId,
    variantId: job.variantId,
    datasetType: job.datasetType,
    inputSize: job.inputSize,
    seed: job.seed,
    harness: "pyperf",
    harnessVersion: pyperfV ?? "unknown",
    benchmarkMode: "avgt",
    warmup: job.warmup,
    repetitions: observations.length,
    observations,
    verify: {
      inputChecksumHex: verify?.input ?? "",
      outputChecksumHex: verify?.output ?? "",
      cases: verify?.cases ?? {},
    },
    env: {
      runtime: py ?? "CPython (version unavailable)",
      runtimeDetail: "CPython interpreter; pyperf worker-process isolation, PYTHONHASHSEED=0",
      harness: "pyperf",
      harnessVersion: pyperfV ?? "unknown",
    },
    rawOutput,
    warnings,
    durationMs: Date.now() - started,
  };
}

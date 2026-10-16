// CodeBench — C++ engine wrapper: compile (g++ + Google Benchmark) and execute one job

import { spawn } from "child_process";
import { existsSync, mkdirSync, readFileSync, statSync, unlinkSync } from "fs";
import path from "path";
import type { JobResult, JobSpec } from "../spec";
import { RESULT_SCHEMA_VERSION } from "../spec";
import { BIN_DIR, CPP_BINARY, CPP_SOURCE, GB_INCLUDE, GB_LIB, GB_VERSION, TMP_DIR, gxxVersion } from "./paths";

interface GbJson {
  context?: Record<string, unknown>;
  benchmarks?: Array<{
    name: string;
    run_type?: string;
    aggregate_name?: string;
    repetitions?: number;
    iterations?: number;
    real_time?: number;
    cpu_time?: number;
    time_unit?: string;
  }>;
}

export interface VerifySidecar {
  variant: string;
  input: string;
  output: string;
  cases: Record<string, string>;
}

export function readVerifySidecar(file: string): VerifySidecar | null {
  try {
    return JSON.parse(readFileSync(file, "utf8")) as VerifySidecar;
  } catch {
    return null;
  }
}

/** Compile the C++ benchmark binary against Google Benchmark (cached by mtime). */
export async function ensureCppCompiled(): Promise<void> {
  mkdirSync(BIN_DIR, { recursive: true });
  const needsCompile =
    !existsSync(CPP_BINARY) || statSync(CPP_SOURCE).mtimeMs > statSync(CPP_BINARY).mtimeMs;
  if (!needsCompile) return;
  await new Promise<void>((resolve, reject) => {
    const args = [
      "-std=c++20",
      "-O2",
      "-I",
      GB_INCLUDE,
      CPP_SOURCE,
      GB_LIB,
      "-lpthread",
      "-o",
      CPP_BINARY,
    ];
    const p = spawn("g++", args, { stdio: ["ignore", "pipe", "pipe"] });
    let err = "";
    p.stderr.on("data", (d) => (err += d.toString()));
    p.on("error", reject);
    p.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`g++ failed (${code}): ${err.slice(0, 4000)}`));
    });
  });
}

export interface RunOutcome {
  code: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
}

/** Spawn with process-group isolation and a hard timeout (kills the whole group). */
export function spawnIsolated(
  command: string,
  args: string[],
  env: NodeJS.ProcessEnv,
  timeoutMs: number
): Promise<RunOutcome> {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      env,
      stdio: ["ignore", "pipe", "pipe"],
      detached: true,
    });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let stdoutTruncated = false;
    const cap = 2_000_000; // keep at most ~2 MB of harness output per stream
    child.stdout.on("data", (d: Buffer) => {
      if (stdout.length < cap) stdout += d.toString();
      else stdoutTruncated = true;
    });
    child.stderr.on("data", (d: Buffer) => {
      if (stderr.length < cap) stderr += d.toString();
    });
    const timer = setTimeout(() => {
      timedOut = true;
      try {
        if (child.pid) process.kill(-child.pid, "SIGKILL");
      } catch {
        child.kill("SIGKILL");
      }
    }, timeoutMs);
    child.on("error", (err) => {
      clearTimeout(timer);
      resolve({ code: null, stdout, stderr: stderr + String(err), timedOut });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (stdoutTruncated) stderr += "\n[codebench] harness output truncated at 2 MB";
      resolve({ code, stdout, stderr, timedOut });
    });
  });
}

export async function runCppJob(job: JobSpec): Promise<JobResult> {
  const started = Date.now();
  mkdirSync(TMP_DIR, { recursive: true });
  const workDir = path.join(TMP_DIR, `cpp-${job.runId}-${job.algorithmId}-${job.variantId}-${job.inputSize}`);
  mkdirSync(workDir, { recursive: true });
  const verifyFile = path.join(workDir, "verify.json");
  const gbFile = path.join(workDir, "gb.json");

  await ensureCppCompiled();

  const env: NodeJS.ProcessEnv = {
    ...process.env,
    CB_VARIANT: job.variantId,
    CB_DATASET: job.datasetType,
    CB_SIZE: String(job.inputSize),
    CB_SEED: String(job.seed),
    CB_WARMUP: String(job.warmup),
    CB_VERIFY_OUT: verifyFile,
    CB_MODE: "bench",
  };

  const minTimeS = Math.max(0.02, job.minTimeMs / 1000).toFixed(3);
  const outcome = await spawnIsolated(
    CPP_BINARY,
    [
      // UseRealTime() appends "/real_time" to the benchmark name
      `--benchmark_filter=^BM_codebench`,
      `--benchmark_repetitions=${Math.max(1, job.repetitions)}`,
      `--benchmark_min_time=${minTimeS}s`,
      `--benchmark_format=json`,
      `--benchmark_out=${gbFile}`,
      `--benchmark_report_aggregates_only=false`,
    ],
    env,
    job.timeoutMs
  );

  const gxx = await gxxVersion();
  const warnings: string[] = [];
  let observations: number[] = [];
  let rawOutput = "";

  if (outcome.timedOut) throw new Error(`C++ job timed out after ${job.timeoutMs} ms`);
  if (outcome.code !== 0) {
    throw new Error(
      `C++ benchmark exited with code ${outcome.code}: ${outcome.stderr.slice(0, 2000) || "(no stderr)"}`
    );
  }
  if (existsSync(gbFile)) {
    rawOutput = readFileSync(gbFile, "utf8");
    const gb = JSON.parse(rawOutput) as GbJson;
    for (const b of gb.benchmarks ?? []) {
      if (b.run_type === "iteration" && !b.aggregate_name && typeof b.real_time === "number") {
        const unit = b.time_unit ?? "ns";
        const factor = unit === "ns" ? 1 : unit === "us" ? 1e3 : unit === "ms" ? 1e6 : unit === "s" ? 1e9 : 1;
        observations.push(b.real_time * factor);
      }
    }
    if (observations.length === 0) warnings.push("Google Benchmark reported no per-iteration results");
  } else {
    warnings.push("Google Benchmark JSON output file missing");
  }

  const verify = existsSync(verifyFile) ? readVerifySidecar(verifyFile) : null;
  if (!verify) warnings.push("verification sidecar missing");

  // cleanup work dir content but keep raw output in the result
  try {
    if (existsSync(gbFile)) unlinkSync(gbFile);
    if (existsSync(verifyFile)) unlinkSync(verifyFile);
  } catch {
    /* best effort */
  }

  if (observations.length === 0) throw new Error("no observations collected from the C++ harness");

  return {
    schemaVersion: RESULT_SCHEMA_VERSION,
    language: "cpp",
    algorithmId: job.algorithmId,
    variantId: job.variantId,
    datasetType: job.datasetType,
    inputSize: job.inputSize,
    seed: job.seed,
    harness: "google-benchmark",
    harnessVersion: GB_VERSION,
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
      runtime: gxx ?? "g++ (version unavailable)",
      runtimeDetail: "g++ -std=c++20 -O2, linked against Google Benchmark (static)",
      harness: "google-benchmark",
      harnessVersion: GB_VERSION,
    },
    rawOutput,
    warnings,
    durationMs: Date.now() - started,
  };
}

/** Verification-only C++ run (engine smoke checks). */
export async function runCppVerifyOnly(job: Omit<JobSpec, "language">): Promise<VerifySidecar | null> {
  mkdirSync(TMP_DIR, { recursive: true });
  const workDir = path.join(TMP_DIR, "cpp-verify");
  mkdirSync(workDir, { recursive: true });
  const verifyFile = path.join(workDir, "verify.json");
  await ensureCppCompiled();
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    CB_VARIANT: job.variantId,
    CB_DATASET: job.datasetType,
    CB_SIZE: String(job.inputSize),
    CB_SEED: String(job.seed),
    CB_WARMUP: "0",
    CB_VERIFY_OUT: verifyFile,
    CB_MODE: "verify",
  };
  await spawnIsolated(CPP_BINARY, [], env, 60_000);
  return existsSync(verifyFile) ? readVerifySidecar(verifyFile) : null;
}

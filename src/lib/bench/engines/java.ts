// CodeBench — Java engine wrapper: compile (javac + JMH annotation processor) and execute one job

import { existsSync, mkdirSync, readFileSync, readdirSync, statSync } from "fs";
import path from "path";
import type { JobResult, JobSpec } from "../spec";
import { RESULT_SCHEMA_VERSION } from "../spec";
import { JAVA_BIN, JAVA_CLASSES, JAVA_LIB, JAVA_SRC, JAVAC, JMH_VERSION, TMP_DIR, javaClasspath, javaVersion } from "./paths";
import { readVerifySidecar, spawnIsolated } from "./cpp";

const VARIANT_TO_METHOD: Record<string, string> = {
  merge_sort: "mergeSort",
  quick_sort: "quickSort",
  heap_sort: "heapSort",
  insertion_sort: "insertionSort",
  std_sort: "stdSort",
  linear_search: "linearSearch",
  binary_search: "binarySearch",
  hash_lookup: "hashLookup",
  dynamic_array: "dynamicArray",
  queue_ops: "queueOps",
  priority_queue_ops: "priorityQueueOps",
  pq_std: "pqStd",
  hash_map_ops: "hashMapOps",
  bfs: "bfs",
  dfs: "dfs",
  dijkstra: "dijkstra",
  naive_search: "naiveSearch",
  kmp: "kmp",
  matmul_naive: "matmulNaive",
  matmul_ikj: "matmulIkj",
};

interface JmhResult {
  benchmark?: string;
  primaryMetric?: {
    score?: number;
    scoreUnit?: string;
    rawData?: number[][];
  };
  secondaryMetrics?: Record<string, { score?: number; scoreUnit?: string }>;
}

export async function ensureJavaCompiled(): Promise<void> {
  mkdirSync(JAVA_CLASSES, { recursive: true });
  const srcFiles = readdirSync(JAVA_SRC)
    .filter((f) => f.endsWith(".java"))
    .map((f) => path.join(JAVA_SRC, f));
  const newestSrc = Math.max(...srcFiles.map((f) => statSync(f).mtimeMs));
  const marker = path.join(JAVA_CLASSES, "codebench", "Benchmarks.class");
  const needsCompile = !existsSync(marker) || newestSrc > statSync(marker).mtimeMs;
  if (!needsCompile) return;
  const cp = [path.join(JAVA_LIB, `jmh-core-${JMH_VERSION}.jar`), path.join(JAVA_LIB, `jmh-generator-annprocess-${JMH_VERSION}.jar`)].join(":");
  const outcome = await spawnIsolated(
    JAVAC,
    ["-proc:full", "-cp", cp, "-d", JAVA_CLASSES, ...srcFiles],
    process.env,
    120_000
  );
  if (outcome.code !== 0) {
    throw new Error(`javac failed (${outcome.code}): ${outcome.stderr.slice(0, 4000)}`);
  }
}

export async function runJavaJob(job: JobSpec): Promise<JobResult> {
  const started = Date.now();
  await ensureJavaCompiled();
  mkdirSync(TMP_DIR, { recursive: true });
  const workDir = path.join(TMP_DIR, `java-${job.runId}-${job.algorithmId}-${job.variantId}-${job.inputSize}`);
  mkdirSync(workDir, { recursive: true });
  const verifyFile = path.join(workDir, "verify.json");
  const jmhFile = path.join(workDir, "jmh.json");

  const baseEnv: NodeJS.ProcessEnv = {
    ...process.env,
    CB_VARIANT: job.variantId,
    CB_DATASET: job.datasetType,
    CB_SIZE: String(job.inputSize),
    CB_SEED: String(job.seed),
  };

  // ---- step 1: verification (plain JVM, no JMH) ----
  const verifyOutcome = await spawnIsolated(
    JAVA_BIN,
    ["-cp", javaClasspath(), "codebench.VerifyMain"],
    { ...baseEnv, CB_VERIFY_OUT: verifyFile },
    60_000
  );
  const warnings: string[] = [];
  let verify = existsSync(verifyFile) ? readVerifySidecar(verifyFile) : null;
  if (!verify) {
    warnings.push(`verification sidecar missing (stderr: ${verifyOutcome.stderr.slice(0, 500)})`);
    verify = { variant: job.variantId, input: "", output: "", cases: {} };
  }

  // ---- step 2: JMH measurement ----
  const method = VARIANT_TO_METHOD[job.variantId];
  if (!method) throw new Error(`no JMH method for variant ${job.variantId}`);

  const warmupIters = Math.max(1, job.warmup);
  const measureIters = Math.max(1, job.repetitions);
  const jmhArgs = [
    "-Xms256m",
    "-Xmx1024m",
    "-cp",
    javaClasspath(),
    "org.openjdk.jmh.Main",
    `^codebench\\.Benchmarks\\.${method}$`,
    "-rf",
    "json",
    "-rff",
    jmhFile,
    "-f",
    "1",
    "-wi",
    String(warmupIters),
    "-i",
    String(measureIters),
    "-w",
    "1s",
    "-r",
    "200ms",
    "-foe",
    "true",
    "-prof",
    "gc",
  ];
  const jmhOutcome = await spawnIsolated(JAVA_BIN, jmhArgs, baseEnv, job.timeoutMs);
  if (jmhOutcome.timedOut) throw new Error(`JMH job timed out after ${job.timeoutMs} ms`);
  if (jmhOutcome.code !== 0) {
    throw new Error(`JMH exited with code ${jmhOutcome.code}: ${jmhOutcome.stderr.slice(0, 2000)}`);
  }

  let observations: number[] = [];
  let rawOutput = "";
  let allocPerOp: number | undefined;
  if (existsSync(jmhFile)) {
    rawOutput = readFileSync(jmhFile, "utf8");
    const results = JSON.parse(rawOutput) as JmhResult[];
    const primary = results[0]?.primaryMetric;
    if (primary?.rawData && primary.rawData.length > 0) {
      observations = primary.rawData[0].filter((v) => typeof v === "number" && isFinite(v));
    }
    const gcNorm = results[0]?.secondaryMetrics?.["gc.alloc.rate.norm"];
    if (typeof gcNorm?.score === "number") allocPerOp = gcNorm.score;
  } else {
    warnings.push("JMH JSON output file missing");
  }
  if (observations.length === 0) throw new Error("no observations collected from JMH");

  const jv = await javaVersion();

  return {
    schemaVersion: RESULT_SCHEMA_VERSION,
    language: "java",
    algorithmId: job.algorithmId,
    variantId: job.variantId,
    datasetType: job.datasetType,
    inputSize: job.inputSize,
    seed: job.seed,
    harness: "jmh",
    harnessVersion: JMH_VERSION,
    benchmarkMode: "avgt",
    warmup: job.warmup,
    repetitions: observations.length,
    observations,
    verify: {
      inputChecksumHex: verify.input,
      outputChecksumHex: verify.output,
      cases: verify.cases,
    },
    env: {
      runtime: jv ?? "OpenJDK (version unavailable)",
      runtimeDetail: "single fork, -Xms256m -Xmx1024m, gc profiler enabled, avgt mode ns/op",
      harness: "jmh",
      harnessVersion: JMH_VERSION,
    },
    rawOutput,
    extraMetrics: allocPerOp !== undefined ? { "java.gc.alloc.rate.norm_b_per_op": allocPerOp } : undefined,
    warnings,
    durationMs: Date.now() - started,
  };
}

// CodeBench — engine paths and host tool probing
//
// Engine binaries are compiled lazily and cached under .cache/bin (gitignored).
// The heavy third-party harnesses (Google Benchmark) live under
// .cache/benchdeps and are provisioned by scripts/setup-toolchain.sh;
// JMH jars are committed under engines/java/lib.

import { execFile } from "child_process";
import { existsSync } from "fs";
import path from "path";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

export const PROJECT_ROOT = process.cwd();
export const CACHE_DIR = path.join(PROJECT_ROOT, ".cache");
export const BIN_DIR = path.join(CACHE_DIR, "bin");
export const TMP_DIR = path.join(CACHE_DIR, "tmp");
export const CPP_SOURCE = path.join(PROJECT_ROOT, "engines", "cpp", "codebench.cpp");
export const CPP_BINARY = path.join(BIN_DIR, "codebench_cpp");
export const GB_DIR = path.join(CACHE_DIR, "benchdeps", "benchmark");
export const GB_LIB = path.join(GB_DIR, "build", "src", "libbenchmark.a");
export const GB_INCLUDE = path.join(GB_DIR, "include");
export const GB_VERSION = "1.9.4";
export const JAVA_SRC = path.join(PROJECT_ROOT, "engines", "java", "src");
export const JAVA_LIB = path.join(PROJECT_ROOT, "engines", "java", "lib");
export const JAVA_CLASSES = path.join(BIN_DIR, "java-classes");
export const JDK_HOME = process.env.CODEBENCH_JDK_HOME || "/home/z/.jdk";
export const JAVAC = path.join(JDK_HOME, "bin", "javac");
export const JAVA_BIN = path.join(JDK_HOME, "bin", "java");
export const JMH_VERSION = "1.37";
export const PYTHON_BENCH = path.join(PROJECT_ROOT, "engines", "python", "codebench_bench.py");

const JMH_JARS = [
  `jmh-core-${JMH_VERSION}.jar`,
  `jmh-generator-annprocess-${JMH_VERSION}.jar`,
  "jopt-simple-5.0.4.jar",
  "commons-math3-3.6.1.jar",
];

export function javaClasspath(includeClasses = true): string {
  const jars = JMH_JARS.map((j) => path.join(JAVA_LIB, j));
  const parts = includeClasses ? [JAVA_CLASSES, ...jars] : jars;
  return parts.join(":");
}

// ---------------------------------------------------------------------------
// Host tool probing with caching (first successful capture is reused)
// ---------------------------------------------------------------------------

const toolCache = new Map<string, string>();

export async function probeTool(command: string, args: string[], key: string): Promise<string | null> {
  if (toolCache.has(key)) return toolCache.get(key)!;
  try {
    const { stdout, stderr } = await execFileAsync(command, args, { timeout: 10_000 });
    const out = (stdout + stderr).trim().split("\n")[0].trim();
    toolCache.set(key, out || null);
    return out;
  } catch {
    toolCache.set(key, "");
    return null;
  }
}

export async function gxxVersion(): Promise<string | null> {
  return probeTool("g++", ["--version"], "gxx");
}

export async function javaVersion(): Promise<string | null> {
  return probeTool(JAVA_BIN, ["-version"], "java");
}

export async function pythonVersion(): Promise<string | null> {
  return probeTool("python3", ["--version"], "python");
}

export async function pyperfVersion(): Promise<string | null> {
  return probeTool("python3", ["-c", "import pyperf; print(pyperf.__version__)"], "pyperf");
}

export interface EngineAvailability {
  language: "cpp" | "java" | "python";
  available: boolean;
  runtime: string | null;
  harness: string;
  harnessVersion: string | null;
  detail: string;
}

export async function checkCppEngine(): Promise<EngineAvailability> {
  const gxx = await gxxVersion();
  const hasLib = existsSync(GB_LIB);
  const detail = !gxx
    ? "g++ not found on PATH"
    : !hasLib
      ? `Google Benchmark library not built at ${GB_LIB} — run scripts/setup-toolchain.sh`
      : "ready";
  return {
    language: "cpp",
    available: Boolean(gxx) && hasLib,
    runtime: gxx,
    harness: "google-benchmark",
    harnessVersion: hasLib ? GB_VERSION : null,
    detail,
  };
}

export async function checkJavaEngine(): Promise<EngineAvailability> {
  const javacExists = existsSync(JAVAC);
  const jarsOk = JMH_JARS.every((j) => existsSync(path.join(JAVA_LIB, j)));
  const java = javacExists ? await javaVersion() : null;
  const detail = !javacExists
    ? `JDK not found at ${JDK_HOME} (set CODEBENCH_JDK_HOME) — run scripts/setup-toolchain.sh`
    : !jarsOk
      ? `JMH jars missing under ${JAVA_LIB}`
      : "ready";
  return {
    language: "java",
    available: javacExists && jarsOk,
    runtime: java,
    harness: "jmh",
    harnessVersion: jarsOk ? JMH_VERSION : null,
    detail,
  };
}

export async function checkPythonEngine(): Promise<EngineAvailability> {
  const py = await pythonVersion();
  const pyperfV = await pyperfVersion();
  const detail = !py ? "python3 not found on PATH" : !pyperfV ? "pyperf not installed (pip install pyperf)" : "ready";
  return {
    language: "python",
    available: Boolean(py && pyperfV),
    runtime: py,
    harness: "pyperf",
    harnessVersion: pyperfV,
    detail,
  };
}

export async function checkAllEngines(): Promise<EngineAvailability[]> {
  return Promise.all([checkCppEngine(), checkJavaEngine(), checkPythonEngine()]);
}

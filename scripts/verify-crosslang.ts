// CodeBench — cross-language verification gate
//
// Compares the fixed verify-case checksums of every variant across the
// TypeScript reference, the C++ engine, the Java engine and the Python
// engine. Exit code 0 only when every case matches in every language.
//
// Usage: bun scripts/verify-crosslang.ts

import { spawnSync } from "child_process";
import { existsSync, mkdirSync, readFileSync } from "fs";
import path from "path";

const ROOT = path.resolve(import.meta.dir, "..");
const CPP = path.join(ROOT, ".cache", "bin", "codebench_cpp");
const JAVA = process.env.CODEBENCH_JDK_HOME ? path.join(process.env.CODEBENCH_JDK_HOME, "bin", "java") : "/home/z/.jdk/bin/java";
const JAVA_CP = [
  path.join(ROOT, ".cache", "bin", "java-classes"),
  ...["jmh-core-1.37.jar", "jopt-simple-5.0.4.jar", "commons-math3-3.6.1.jar"].map((j) =>
    path.join(ROOT, "engines", "java", "lib", j)
  ),
].join(":");
const TMP = path.join(ROOT, ".cache", "tmp", "crosslang");

const VARIANTS = [
  "sorting.merge_sort", "sorting.quick_sort", "sorting.heap_sort", "sorting.insertion_sort", "sorting.std_sort",
  "search.linear_search", "search.binary_search", "search.hash_lookup",
  "datastructures.dynamic_array", "datastructures.queue_ops", "datastructures.priority_queue_ops",
  "datastructures.pq_std", "datastructures.hash_map_ops",
  "graphs.bfs", "graphs.dfs", "graphs.dijkstra",
  "strings.naive_search", "strings.kmp",
  "matrix.matmul_naive", "matrix.matmul_ikj",
];

const PY_VERIFY_SNIPPET = `
import os, sys, json
sys.path.insert(0, ENG_DIR)
import codebench_algorithms as cb
variant = os.environ.get("CB_VARIANT", "merge_sort")
dataset = os.environ.get("CB_DATASET", "random_int")
size = int(os.environ.get("CB_SIZE", "257"))
seed = int(os.environ.get("CB_SEED", "42"))
payload = {
    "variant": variant,
    "input": cb.fnv1a_hex(cb.canonical_input_for(dataset, size, seed)),
    "output": cb.fnv1a_hex(cb.verify_output(variant, dataset, size, seed)),
    "cases": cb.verify_cases(variant),
}
with open(os.environ["CB_VERIFY_OUT"], "w") as f:
    json.dump(payload, f)
`.replace("ENG_DIR", JSON.stringify(path.join(ROOT, "engines", "python")));

interface VerifySidecar {
  variant: string;
  input: string;
  output: string;
  cases: Record<string, string>;
}

function readSidecar(f: string): VerifySidecar | null {
  if (!existsSync(f)) return null;
  try {
    return JSON.parse(readFileSync(f, "utf8")) as VerifySidecar;
  } catch {
    return null;
  }
}

async function main() {
  const { runReference, verifyCasesFor, VERIFY_SEED } = await import("../src/lib/bench/reference");
  mkdirSync(TMP, { recursive: true });

  let failures = 0;
  let checks = 0;

  for (const variantKey of VARIANTS) {
    const variantId = variantKey.split(".")[1];

    // TypeScript reference
    let ref: Record<string, string> = {};
    try {
      const cases = verifyCasesFor(variantKey);
      for (const c of cases) {
        const r = runReference(variantKey, c.dataset, c.n, VERIFY_SEED);
        ref[c.key] = r.outputChecksumHex;
      }
    } catch (e) {
      console.error(`✗ ${variantKey} — REFERENCE ERROR: ${e instanceof Error ? e.message : String(e)}`);
      failures++;
      continue;
    }

    const details: string[] = [];

    // C++ engine
    const cppOut = path.join(TMP, "cpp.json");
    const cpp = spawnSync(CPP, [], {
      env: {
        ...process.env,
        CB_VARIANT: variantId,
        CB_DATASET: "random_int",
        CB_SIZE: "257",
        CB_SEED: "42",
        CB_MODE: "verify",
        CB_VERIFY_OUT: cppOut,
      },
      timeout: 60_000,
    });
    const cppCases = cpp.status === 0 ? readSidecar(cppOut)?.cases ?? null : null;
    if (!cppCases) details.push(`cpp: engine failed (${String(cpp.stderr).slice(0, 200)})`);

    // Java engine
    const javaOut = path.join(TMP, "java.json");
    const java = spawnSync(JAVA, ["-cp", JAVA_CP, "codebench.VerifyMain"], {
      env: {
        ...process.env,
        CB_VARIANT: variantId,
        CB_DATASET: "random_int",
        CB_SIZE: "257",
        CB_SEED: "42",
        CB_VERIFY_OUT: javaOut,
      },
      timeout: 120_000,
    });
    const javaCases = java.status === 0 ? readSidecar(javaOut)?.cases ?? null : null;
    if (!javaCases) details.push(`java: engine failed (${String(java.stderr).slice(0, 200)})`);

    // Python engine
    const pyOut = path.join(TMP, "py.json");
    const py = spawnSync("python3", ["-c", PY_VERIFY_SNIPPET], {
      env: {
        ...process.env,
        CB_VARIANT: variantId,
        CB_DATASET: "random_int",
        CB_SIZE: "257",
        CB_SEED: "42",
        CB_VERIFY_OUT: pyOut,
      },
      timeout: 120_000,
    });
    const pyCases = py.status === 0 ? readSidecar(pyOut)?.cases ?? null : null;
    if (!pyCases) details.push(`python: engine failed (${String(py.stderr).slice(0, 200)})`);

    let ok = true;
    for (const [engineName, cases] of [
      ["cpp", cppCases],
      ["java", javaCases],
      ["python", pyCases],
    ] as Array<[string, Record<string, string> | null]>) {
      if (!cases) {
        ok = false;
        continue;
      }
      for (const [k, v] of Object.entries(ref)) {
        checks++;
        if (cases[k] !== v) {
          details.push(`${engineName} ${k}: expected ${v} got ${cases[k] ?? "MISSING"}`);
          ok = false;
        }
      }
    }

    if (!ok) failures++;
    console.log(`${ok ? "✓" : "✗"} ${variantKey}${details.length ? ` — ${details.join("; ")}` : ""}`);
  }

  console.log(`\n${VARIANTS.length - failures}/${VARIANTS.length} variants consistent across languages, ${checks} checksum comparisons`);
  if (failures > 0) {
    console.error("CROSS-LANGUAGE VERIFICATION FAILED");
    process.exit(1);
  }
  console.log("CROSS-LANGUAGE VERIFICATION PASSED");
}

void main();

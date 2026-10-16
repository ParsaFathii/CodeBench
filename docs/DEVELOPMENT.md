# Development guide

How to set up a working CodeBench development environment, run the platform,
and extend it with new algorithm variants.

## Prerequisites

| Tool | Version used | Needed for |
|---|---|---|
| Node.js / bun | Node 24, bun 1.3 | web app, coordinator, scripts |
| g++ | 14.2 (any C++20 compiler) | C++ engine (`-std=c++20 -O2`) |
| Temurin JDK | 21 | Java engine (javac + JMH); set `CODEBENCH_JDK_HOME` |
| python3 | 3.12 | Python engine |
| pyperf | 2.x (`pip install pyperf`) | Python harness |
| cmake | any recent | building Google Benchmark for the C++ harness |

The heavy third-party dependencies are provisioned by
`scripts/setup-toolchain.sh` (below). Note that **the JMH jars are committed
under `engines/java/lib/`**, so the Java engine is self-contained once a JDK
is present.

## Engine setup

The setup script performs four steps: pip packages, Temurin JDK 21, JMH
jars, and a Google Benchmark build. Its logic:

```sh
# [1/4] Python toolchain: cmake (for the GB build) + pyperf
pip3 install --quiet cmake pyperf

# [2/4] Temurin JDK 21 (Adoptium API, linux/x64)
curl -sL --max-time 300 -o jdk21.tar.gz \
  "https://api.adoptium.net/v3/binary/latest/21/ga/linux/x64/jdk/hotspot/normal/eclipse"
mkdir -p /home/z/.jdk
tar -xzf jdk21.tar.gz -C /home/z/.jdk --strip-components=1

# [3/4] JMH 1.37 jars from Maven Central into engines/java/lib/
# (these jars are committed to the repository, so this step is only
#  needed if they are missing)
curl -sL -O "https://repo1.maven.org/maven2/org/openjdk/jmh/jmh-core/1.37/jmh-core-1.37.jar"
curl -sL -O "https://repo1.maven.org/maven2/org/openjdk/jmh/jmh-generator-annprocess/1.37/jmh-generator-annprocess-1.37.jar"
curl -sL -O "https://repo1.maven.org/maven2/net/sf/jopt-simple/jopt-simple/5.0.4/jopt-simple-5.0.4.jar"
curl -sL -O "https://repo1.maven.org/maven2/org/apache/commons/commons-math3/3.6.1/commons-math3-3.6.1.jar"

# [4/4] Google Benchmark v1.9.4 (static library, tests disabled)
git clone --depth 1 --branch v1.9.4 https://github.com/google/benchmark.git
cd benchmark
cmake -S . -B build -DCMAKE_BUILD_TYPE=Release \
      -DBENCHMARK_ENABLE_TESTING=OFF \
      -DBENCHMARK_ENABLE_GTEST_TESTS=OFF \
      -DBENCHMARK_ENABLE_WERROR=OFF \
      -DBENCHMARK_USE_LIBCXX=OFF
cmake --build build -j2
# expected artifact: build/src/libbenchmark.a
```

Expected locations (see `src/lib/bench/engines/paths.ts`):

- JDK: `$CODEBENCH_JDK_HOME` (fallback `/home/z/.jdk`); the wrappers call
  `$CODEBENCH_JDK_HOME/bin/javac` and `…/bin/java`.
- Google Benchmark: `.cache/benchdeps/benchmark/` (headers at `include/`,
  library at `build/src/libbenchmark.a`). This directory is a local build
  cache and is gitignored.
- Compiled engine binaries/classes: `.cache/bin/` (gitignored), produced
  lazily by `ensureCppCompiled()` / `ensureJavaCompiled()` with mtime
  caching.
- Job scratch directories: `.cache/tmp/`.

Verify availability at any time:

```sh
curl -s http://localhost:3000/api/v1/languages
```

`available: true` per language means the runtime and harness were found.

## Commands

```sh
bun install            # dependencies
bun run db:push        # create/push the SQLite schema (prisma db push)
bun run dev            # dev server on port 3000

bun run lint           # eslint

bun scripts/verify-crosslang.ts   # cross-language correctness gate (below)

bash scripts/seed-demo-data.sh    # seed demo experiments through the public API
```

`scripts/seed-demo-data.sh` requires the server to be running; it creates
five experiments (sorting across languages, search + data structures,
graph traversal, strings + matrix, and a sorting re-run for regression
comparisons) by calling `POST /experiments` and `POST /experiments/{id}/run`
exactly like a user would, then polls to completion.

Other database scripts: `bun run db:generate` (regenerate the Prisma
client), `bun run db:migrate`, `bun run db:reset`.

## The cross-language correctness gate

```sh
bun scripts/verify-crosslang.ts
```

This is the gate that must pass **before any timing is trusted**. For every
one of the 20 variants it:

1. computes the fixed verify-case checksums from the TypeScript reference,
2. runs the C++ engine (`CB_MODE=verify`), the Java `VerifyMain` and the
   Python verification snippet,
3. compares all fixed-case checksums across the four implementations.

Expected output: `20/20 variants consistent across languages, 120 checksum
comparisons` followed by `CROSS-LANGUAGE VERIFICATION PASSED` (exit code 0).
Any mismatch fails the gate with the exact case and expected/got checksums.

## Project layout

```
engines/
  cpp/codebench.cpp        C++ engine: PRNG, datasets, algorithms, GB harness,
                           verification sidecar, explicit warm-up
  java/src/codebench/
    Algorithms.java        generators + algorithms + FNV-1a + verify cases
    Benchmarks.java        JMH @Benchmark methods (one per variant)
    VerifyMain.java        standalone verifier (plain JVM, no JMH)
  java/lib/                committed JMH jars (jmh-core 1.37, annprocessor,
                           jopt-simple, commons-math3)
  python/
    codebench_algorithms.py  generators + algorithms + checksums (shared)
    codebench_bench.py       pyperf runner + verification sidecar
src/lib/bench/
  spec.ts                  shared types, ExperimentConfig, Stats, result schema
  registry.ts              algorithm catalog (20 variants, 6 families)
  prng.ts                  SplitMix64 + FNV-1a 64 (TS reference of the contract)
  reference.ts             TS reference implementations + dataset generators
                           + fixed verify cases
  stats.ts                 deterministic statistics from raw observations
  comparison.ts            run-to-run regression verdicts
  coordinator.ts           run lifecycle, serial execution, verification
  reports.ts               JSON / CSV / Markdown report generation
  env.ts                   environment snapshot capture
  settings.ts              persisted application settings
  engines/                 cpp.ts / java.ts / python.ts wrappers + paths.ts
src/lib/ai/
  provider.ts              zai / ollama / disabled provider abstraction
  analyze.ts               evidence building, schema validation, grounding
src/app/api/v1/            all HTTP endpoints (Route Handlers)
src/components/bench/      single-route SPA: shell, views, charts, api client
prisma/schema.prisma       SQLite schema
scripts/                   verify-crosslang.ts, seed-demo-data.sh
.cache/                    gitignored: toolchain deps, compiled binaries, tmp
```

## Adding a new algorithm variant

The checklist — a variant exists only when all of these are done, because
the platform's core promise is bit-identical inputs and outputs across
languages:

1. **TypeScript reference** (`src/lib/bench/reference.ts`): implement the
   algorithm and add a `runReference` case for the new variant key. If it is
   a new *family*, also add a case to `verifyCasesFor` (fixed dataset + n).
2. **C++ engine** (`engines/cpp/codebench.cpp`): implement the op in
   `runOp`, the canonical output in `verifyOutput`, and register the variant
   in the family lists in `main` (which select the fixed verify cases).
3. **Java engine**: algorithm/verification in
   `engines/java/src/codebench/Algorithms.java` (including
   `verifyOutput`/`verifyCasesJson`), a `@Benchmark` method in
   `Benchmarks.java`, and the variant → method mapping in
   `VARIANT_TO_METHOD` (`src/lib/bench/engines/java.ts`).
4. **Python engine**: `verify_output` support in
   `engines/python/codebench_algorithms.py` and the measured op closure in
   `make_op` (`codebench_bench.py`).
5. **Registry entry** (`src/lib/bench/registry.ts`): id, name, category
   (hand-written vs standard-library), complexity, `measuredOp` wording,
   optional `maxSize` — this is what the API and UI serve.
6. **Gate list** (`scripts/verify-crosslang.ts`): add the variant key to
   `VARIANTS` so it is covered by the correctness gate.
7. **Run the gate**: `bun scripts/verify-crosslang.ts` must pass for the new
   variant (checksums identical across TS / C++ / Java / Python) before any
   benchmark run uses it.

Constraints to keep in mind: the measured-op contract must match the family
conventions (defensive copy inside destructive sorts, visited-array reset
inside traversals, fresh containers per cycle, untimed table build for
lookups); results must be consumed (sink / Blackhole / return value) so the
optimizer cannot eliminate the work; the canonical output encoding must be
decided once and mirrored everywhere.

## Testing philosophy

- **Correctness before timing.** The cross-language gate and the per-run
  verification (reference match + cross-language checksum equality) are the
  primary tests. A number produced by an unverified implementation is not a
  measurement; failed verification marks results `FAILED` and excludes them
  from comparisons (`NOT-COMPARABLE`).
- **Verification is embedded in every run**, not a one-time CI check: each
  engine writes its sidecar on the exact measured input before timing, and
  the coordinator re-checks fixed cases against the TypeScript reference
  after the run.
- **Raw data is kept.** Observations and harness output are stored so any
  statistic can be recomputed or audited later.
- **Statistics are deterministic pure functions** (`stats.ts`) — no AI
  involvement, no harness-dependent aggregation.
- **Smoke runs are end-to-end**: an experiment through the public API that
  completes with all verifications passing is the acceptance test for
  toolchain or engine changes (`seed-demo-data.sh` exercises exactly this
  path).

# Architecture

CodeBench is a cross-language algorithm benchmarking platform. It runs the same
deterministic workloads in C++ (Google Benchmark), Java (JMH) and Python
(pyperf), stores every raw observation in SQLite, and layers statistics,
regression comparison, reports and an optional AI interpreter on top. This
document describes the moving parts and why they are shaped the way they are.

## Component overview

```
                       Browser
        ┌──────────────────────────────────────────┐
        │  Single-route SPA served at "/"           │
        │  (hash-based view routing, 10 views:      │
        │   workbench, catalog, runner, results,    │
        │   compare, regression, history,           │
        │   environment, ai, settings)              │
        └───────────────────┬──────────────────────┘
                            │  fetch()  /api/v1/*
                            ▼
        ┌──────────────────────────────────────────┐
        │  Next.js App Router — Route Handlers      │
        │  src/app/api/v1/**/route.ts               │
        │  (stateless HTTP façade, force-dynamic)   │
        └───────┬───────────────────┬──────────────┘
                │                   │
                │                   │ read-only paths
                │                   ├────────────► catalog/registry (in-memory)
                │                   ├────────────► statistics (pure functions)
                │                   ├────────────► comparison / reports
                │                   └────────────► AI adapter (optional)
                │ write/execute paths
                ▼
        ┌──────────────────────────────────────────┐
        │  Experiment coordinator                   │
        │  src/lib/bench/coordinator.ts             │
        │  in-process singleton (survives Next.js   │
        │  module reloads via globalThis)           │
        │  state machine:                           │
        │  QUEUED → PREPARING → RUNNING →           │
        │  VERIFYING → ANALYZING →                  │
        │  COMPLETED | FAILED | CANCELLED           │
        └───────┬──────────────┬────────────┬──────┘
                │ spawn        │ spawn      │ spawn
                ▼              ▼            ▼
        ┌────────────┐  ┌────────────┐  ┌──────────────────┐
        │ C++ engine │  │ Java engine│  │ Python engine    │
        │ engines/   │  │ engines/   │  │ engines/python/  │
        │ cpp/code-  │  │ java/…     │  │ codebench_       │
        │ bench.cpp  │  │ JMH +      │  │ algorithms.py    │
        │ compiled   │  │ VerifyMain │  │ codebench_bench  │
        │ with g++   │  │            │  │ .py (pyperf)     │
        │ -std=c++20 │  │            │  │                  │
        │ -O2 + GB   │  │            │  │                  │
        └─────┬──────┘  └─────┬──────┘  └────────┬─────────┘
              │               │                  │
              │  verify sidecar (FNV-1a 64) + harness JSON output
              ▼               ▼                  ▼
        ┌──────────────────────────────────────────────────┐
        │  Prisma Client → SQLite (file)                    │
        │  Experiment, Run, RunLog, BenchmarkResult,        │
        │  EnvSnapshot, AiAnalysis, Report, Setting         │
        └──────────────────────────────────────────────────┘
```

There is no separate worker service. The coordinator runs inside the Next.js
server process, executes jobs by spawning real operating-system subprocesses,
and persists all state to SQLite so the HTTP layer stays stateless.

## Request / data flow of one experiment

1. **Create** — `POST /api/v1/experiments` validates the configuration
   (`validateConfig` in `coordinator.ts`), merges stored defaults for omitted
   fields (warmup, repetitions, timeoutMs, seed) and stores the experiment
   with its JSON `config`.
2. **Run** — `POST /api/v1/experiments/{id}/run` calls `startRun`, which
   captures an environment snapshot, creates a `Run` row and kicks off
   `executeRun` in the background. The API returns `202 { runId }` immediately.
3. **Prepare** — the coordinator compiles the C++ binary (g++ mtime-cached)
   and the Java classes (javac + JMH annotation processor, mtime-cached) so
   toolchain failures surface before any measurement.
4. **Execute** — jobs are the cross product of selected variants, languages
   and input sizes (only combinations the registry marks as available). Jobs
   run strictly serially; progress (`completedJobs/totalJobs`, `currentJob`)
   is written to the `Run` row after every job, and human-readable lines are
   appended to `RunLog`.
5. **Per job** — the engine wrapper spawns the language harness with the job
   parameters in environment variables (`CB_VARIANT`, `CB_DATASET`,
   `CB_SIZE`, `CB_SEED`, `CB_WARMUP`, `CB_VERIFY_OUT`). The engine first
   writes a verification sidecar (FNV-1a 64 checksums of the canonical input
   and output, plus fixed small cases), then performs the timed measurement.
   The wrapper normalizes the harness JSON into `observations` (ns/op, one per
   measured repetition), `rawOutput`, `verify` and `env`, and the coordinator
   stores a `BenchmarkResult` row with statistics computed from the raw
   observations.
6. **Verify** — `verifyRun` compares each engine's fixed-case checksums
   against the TypeScript reference implementation (`reference.ts`), and
   groups results by (variant, dataset, size) to require identical input and
   output checksums across languages. Mismatches mark results `FAILED` and are
   logged; they are never silently dropped.
7. **Analyze** — stability warnings are emitted for results whose coefficient
   of variation is 10% or more; the run transitions to `COMPLETED` (or
   `FAILED` when every job failed).
8. **Consume** — the SPA (or any HTTP client) polls `GET /api/v1/runs/{id}`,
   then reads results, comparisons, reports and AI analysis — all served from
   SQLite.

## Why each language keeps its own harness

The three harnesses are not interchangeable; each exists because its runtime
has different measurement hazards.

- **C++ — Google Benchmark.** The program is ahead-of-time compiled, so there
  is no JIT warm-up, but the optimizer is the enemy: unused results get
  eliminated and stores get cached in registers. Google Benchmark provides
  `DoNotOptimize` / `ClobberMemory` (both used in `codebench.cpp`) and a
  repetition framework (`--benchmark_repetitions`) that reports per-repetition
  aggregates. CodeBench adds an explicit untimed warm-up loop before handing
  control to the harness so caches and branch predictors are hot.
- **Java — JMH.** The JVM compiles hot methods at runtime; timing the first
  invocations would measure the interpreter, not the program. JMH's `-wi`
  (warm-up iterations, each `-w 1s`) brings the measured method to a compiled
  steady state, its single-fork mode (`-f 1`) isolates the trial in a fresh
  JVM, and `Blackhole` consumption prevents dead-code elimination. JMH is the
  canonical Java microbenchmark harness precisely because of these JIT
  semantics.
- **Python — pyperf.** CPython has no JIT, but interpreter-level noise (GC,
  system state, allocator warm-up) is significant. pyperf re-executes the
  benchmark in an isolated worker process, calibrates timing loops, and takes
  warm-up values (`-w`) before collecting measured values (`-n`). CodeBench
  pins `-p 1` (one worker process) so a job is one process, and passes
  `--inherit-environ` so the worker sees the job parameters — without it the
  timed op silently ran with default parameters (a real bug that was found
  and fixed during development).

Forcing a single homemade timing loop onto all three languages would either
mis-handle JVM warm-up or add non-idiomatic overhead. Using each ecosystem's
standard harness means each language is measured the way that language is
normally measured.

What is shared is the *contract*: identical input generation (SplitMix64),
identical canonical output encodings (FNV-1a 64), and identical measured-op
definitions (see `BENCHMARK_METHODOLOGY.md`).

## SQLite storage design

A single SQLite database (via Prisma, `DATABASE_URL`) holds everything; the
schema is in `prisma/schema.prisma`.

| Model | Purpose | Key fields |
|---|---|---|
| `Experiment` | reproducible benchmark definition | `name`, `description`, `config` (JSON `ExperimentConfig`) |
| `Run` | one execution of an experiment | `status`, `progress`, `totalJobs` / `completedJobs` / `failedJobs`, `currentJob`, `commitSha`, `envSnapshotId` |
| `RunLog` | live console lines | `runId`, `ts`, `level` (info/success/warn/error), `message` |
| `BenchmarkResult` | one (variant, language, size) job | `observations` (JSON number[], raw ns/op per repetition), `statsJson`, checksums (`inputChecksumHex`, `jobChecksumHex`, `casesJson`), `verificationStatus`, `refMatch`, `crossLangMatch`, `rawOutput` (preserved harness JSON, capped at 400,000 chars), `envJson`, `extraMetricsJson` (e.g. JMH `gc.alloc.rate.norm`), `status` (COMPLETED/FAILED/TIMEOUT) |
| `EnvSnapshot` | machine/runtime metadata per run | OS, arch, CPU model/cores, total memory, host runtime, `commitSha`, `metadataJson` (load, notes, isolation policy) |
| `AiAnalysis` | optional LLM interpretation | `provider`, `model`, `status`, `inputJson` (exact evidence payload sent), `outputJson` (validated structured output), `error` |
| `Report` | generated JSON/CSV/Markdown reports | `format`, `filename`, `content` |
| `Setting` | app settings (key/value JSON) | AI provider config, experiment defaults, regression threshold |

Design decisions worth noting:

- **Raw observations are the source of truth.** Every repetition is stored;
  all statistics are derived and stored alongside (`statsJson`) but can always
  be recomputed from `observations`.
- **The raw harness output is preserved** (bounded) so a result can be audited
  against what Google Benchmark / JMH / pyperf actually printed.
- **Denormalized names** (`algorithmName`, `variantName`, `category`) are
  copied onto each result so historical rows remain readable even if the
  registry evolves.
- **Env snapshots are per-run**, not global, so comparisons can detect when
  two runs executed on different hardware (see the `environment-differs`
  comparability flag).

## Isolation policy

- **Serial execution.** One run is active at a time (`activeRunId` /
  `queueBusy` in the coordinator). A second `POST …/run` while a run is
  executing returns `409`. Heavy measurements never overlap with each other.
- **One OS process per job.** Each job is a fresh `spawn` of the language
  harness (C++ binary, `java`, or `python3`). No state leaks between jobs.
- **Process-group kill on timeout.** Processes are spawned `detached: true`
  (their own process group). On timeout the coordinator sends `SIGKILL` to
  `-pid` — the whole group — so a JMH fork or pyperf worker cannot survive
  its parent. The job is recorded as `TIMEOUT`.
- **Bounded output capture.** Child stdout/stderr are capped at ~2 MB per
  stream; stored `rawOutput` is capped at 400,000 characters.
- **Stale-run repair.** On `POST …/run` and `GET /api/v1/runs`, runs left in
  an executing state by a server restart are marked `FAILED` with an explicit
  message, never left dangling.
- **The coordinator shares the web server.** This is a known limitation, not
  a hidden assumption: benchmark jobs and the web app run on the same host
  and the same process (execution happens in background async tasks, so API
  requests are never blocked, but CPU contention with the web app itself is
  possible on loaded machines).

## What the AI layer is (and is not)

The AI subsystem (`src/lib/ai/`) is an optional read-only interpreter. It
receives an evidence payload built exclusively from stored database rows,
returns a schema-validated JSON analysis, and writes only to the
`AiAnalysis` table. It has no code path that can modify benchmark records,
runs or results. Details in `AI_INSIGHTS.md`.

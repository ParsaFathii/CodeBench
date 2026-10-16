# HTTP API reference

All endpoints live under `/api/v1` and are implemented as Next.js Route
Handlers (`src/app/api/v1/**/route.ts`). Every route is dynamic. Request and
response bodies are JSON unless noted. The same API backs the web UI, so
anything the UI does can be done with curl.

## Status codes

| Code | Meaning in CodeBench |
|---|---|
| 200 | Success |
| 201 | Resource created (experiment, clone, report) |
| 202 | Accepted for asynchronous processing (run started, cancel requested, AI analysis started) |
| 400 | Malformed request (invalid JSON body, missing required query parameter, bad name) |
| 404 | Referenced entity does not exist |
| 409 | Conflict — another run is executing, no active run to cancel, or the run is still executing (AI analysis) |
| 422 | Semantically invalid payload (configuration validation errors, same baseline/candidate, bad report format, invalid settings) |
| 502 | AI provider failed or produced an unusable response |

---

## Service

### GET /api/v1/health

```json
{ "status": "ok", "service": "codebench", "version": "1.0.0", "time": "2026-01-01T00:00:00.000Z" }
```

### GET /api/v1/environment

Host and engine metadata. `environment` is a fresh capture (OS, arch, CPU
model/cores, memory, host runtime, git commit if available, load average,
isolation policy, notes). `engines` is live availability probing per
language:

```json
{
  "environment": { "osPlatform": "linux", "osVersion": "…", "arch": "x64",
    "cpuModel": "…", "cpuCores": 8, "totalMemBytes": "…",
    "hostRuntime": "Node v24", "commitSha": null, "capturedAt": "…",
    "metadata": { "nodeVersion": "…", "loadavg": [0.1, 0.2, 0.2],
      "freeMemBytes": 0, "uptimeSec": 0,
      "isolationPolicy": "…", "notes": ["…"] } },
  "engines": [
    { "language": "cpp", "available": true, "runtime": "g++ 14.2.0",
      "harness": "google-benchmark", "harnessVersion": "1.9.4", "detail": "ready" },
    { "language": "java", "available": true, "runtime": "openjdk 21…",
      "harness": "jmh", "harnessVersion": "1.37", "detail": "ready" },
    { "language": "python", "available": true, "runtime": "Python 3.12…",
      "harness": "pyperf", "harnessVersion": "2.10.0", "detail": "ready" }
  ]
}
```

### GET /api/v1/languages

```json
{
  "languages": [
    { "id": "cpp", "name": "C++", "standard": "C++20", "harness": "Google Benchmark", "color": "amber" },
    { "id": "java", "name": "Java", "standard": "Java 21 (Temurin)", "harness": "JMH", "color": "rose" },
    { "id": "python", "name": "Python", "standard": "CPython 3.12", "harness": "pyperf", "color": "emerald" }
  ],
  "engines": [ /* same shape as /environment engines */ ]
}
```

### GET /api/v1/algorithms

The verified catalog: `workloadSpecVersion` (`"1.0.0"`), the `algorithms`
array (6 families with their variants, datasets, default sizes, output
contracts) and a flattened `catalog` array (one entry per variant key, with
`variantKey`, `category`, `complexity`, `measuredOp`, `notes`, `maxSize`,
`datasets`, `defaultSizes`, `outputContract`, …). See `ALGORITHMS.md`.

---

## Experiments

### GET /api/v1/experiments

Lists experiments newest first, each with its latest run summary:

```json
{ "experiments": [
  { "id": "clx…", "name": "Sorting across C++ / Java / Python",
    "description": "…", "config": { /* ExperimentConfig */ },
    "createdAt": "…", "runCount": 2,
    "lastRun": { "id": "clx…", "status": "COMPLETED", "createdAt": "…", "progress": 100 } }
] }
```

### POST /api/v1/experiments

Body: `{ "name": string (required, ≤ 120 chars), "description"?: string,
"config"?: Partial<ExperimentConfig> }`.

`ExperimentConfig`:

```json
{
  "variants": ["sorting.merge_sort", "sorting.std_sort"],
  "languages": ["cpp", "java", "python"],
  "datasetType": "random_int",
  "inputSizes": [10000],
  "seed": 20261016,
  "warmup": 2,
  "repetitions": 5,
  "timeoutMs": 180000,
  "benchmarkMode": "avgt",
  "continueOnError": true
}
```

Omitted `warmup` / `repetitions` / `timeoutMs` / `seed` are taken from stored
settings. Validation rules: at least one variant, language and input size;
`warmup ≥ 0`; `repetitions ≥ 2`; `timeoutMs ≥ 10000`; integer seed; known
variant keys; the dataset must be supported by every selected family; input
sizes in 8..2,000,000 and within per-variant caps (e.g. insertion sort
4096).

Responses: `201 { id, name, config, warnings }` (warnings list e.g.
variants unavailable in the selected languages) · `400` invalid JSON or name
· `422 { error: "invalid configuration", details: [...] }`.

### GET /api/v1/experiments/{id}

Experiment detail with all its runs (status, progress, job counters,
`currentJob`, timestamps, error). `404` if not found.

### POST /api/v1/experiments/{id}/run

Starts a new run. The coordinator validates the stored config, captures an
environment snapshot, repairs runs orphaned by a restart, and begins
executing in the background.

Responses: `202 { "runId": "clx…" }` · `404` · `409` (another run is
currently executing — benchmarks run serially; wait or cancel).

### POST /api/v1/experiments/{id}/cancel

Requests cancellation of the experiment's active run. The current job is
terminated (process-group kill) and the run is marked `CANCELLED`.

Responses: `202 { "cancelled": true, "runId": "…" }` · `409` (no active run
for this experiment).

### GET /api/v1/experiments/{id}/results?runId=…

All results across the experiment's runs, or one run's results when
`runId` is given. Each result contains identity fields (`variantKey`,
`category`, `language`, `datasetType`, `inputSize`, `seed`, `harness`,
`harnessVersion`), verification (`verificationStatus`, `refMatch`,
`crossLangMatch`), `observations` (raw ns/op array), `stats`, `extraMetrics`
(e.g. Java allocation rate), `env`, `warnings`, `durationMs`, `status` and
`error`.

### POST /api/v1/experiments/{id}/clone

Copies the experiment definition (name suffixed with " (clone)", same
config). `201 { id, name }` · `404`.

---

## Runs

### GET /api/v1/runs?status=…&limit=…

Run history (newest first, `limit` capped at 100; default 50), with
`activeRunId` surfaced if a run is executing. Also performs stale-run
repair. Each run includes `experimentName`, `config`, `progress`, job
counters, `currentJob`, `resultCount`, `commitSha`, timestamps and `error`.

### GET /api/v1/runs/{id}?afterLogId=…

Full run detail: status/progress/counters, `logs` (live console lines,
ordered; pass the last seen log `id` as `afterLogId` for incremental
polling, capped at 500 lines), `results` (same shape as the experiment
results endpoint) and the captured `environment`. `404` if not found.

### GET /api/v1/runs/{id}/raw?resultId=…

Audit access to preserved harness output. Without `resultId`: an index of
completed results (`{ id, label, harness }`). With `resultId`: `{ id, label,
harness, harnessVersion, env, observations, rawOutput }` where `rawOutput`
is the untouched JSON emitted by Google Benchmark / JMH / pyperf. `404` if
the result does not belong to the run.

---

## Comparisons

### GET /api/v1/comparisons?baseline=…&candidate=…

Regression analysis between two runs. Responses: `400` (missing ids) ·
`422` (same run given twice) · `404` (run not found) · `200` with the
report:

```json
{
  "baselineRunId": "clx…", "candidateRunId": "clx…",
  "comparability": "comparable | workload-differs | environment-differs",
  "comparabilityNotes": ["…"],
  "regressionThresholdPct": 10,
  "rows": [
    { "algorithmId": "sorting", "variantId": "merge_sort",
      "variantKey": "sorting.merge_sort", "language": "cpp",
      "inputSize": 10000, "datasetType": "random_int",
      "baselineMedian": 512345.6, "candidateMedian": 523456.7,
      "deltaPct": 2.17, "ratio": 1.0217,
      "baselineCV": 0.012, "candidateCV": 0.014, "combinedCV": 0.0185,
      "verdict": "INCONCLUSIVE",
      "note": "|Δ| 2.2% < practical threshold 10%" }
  ],
  "generatedAt": "…"
}
```

Verdicts: `REGRESSION` / `IMPROVEMENT` / `INCONCLUSIVE` / `NO-DATA` /
`NOT-COMPARABLE` (see `BENCHMARK_METHODOLOGY.md`).

---

## Reports

### POST /api/v1/reports

Body: `{ "runId": "…", "format": "json | csv | markdown" }`. Generates and
persists a deterministic report (experiment definition, per-result
statistics, raw observations, verification status, environment, methodology
and limitations; AI interpretation is intentionally excluded).

Responses: `201 { id, filename, format, contentType, content }` · `400`
invalid JSON · `422` bad format · `404` run not found.

### GET /api/v1/reports?runId=…[&download=reportId]

Without `download`: `{ "reports": [{ id, format, filename, createdAt }] }`.
With `download`: the stored report content served as an attachment
(`Content-Type` `application/json` / `text/csv` / `text/markdown`). `400`
missing runId · `404` report not found.

---

## AI

### GET /api/v1/ai/status

```json
{ "configured": "zai", "provider": "zai", "available": true,
  "model": "z-ai (server-side SDK)", "detail": "reachable",
  "note": "AI interpretation is optional and strictly separated from measurements. …" }
```

### POST /api/v1/ai/analysis

Body: `{ "runId": "…" }`. Builds the evidence payload from stored results,
calls the configured provider, validates the structured output and checks
grounding.

Responses: `202 { analysisId }` · `400` invalid JSON · `404` run not found ·
`409` run still executing · `422` missing runId · `502` provider failure,
schema violation or grounding rejection.

### GET /api/v1/ai/analysis?runId=…

Lists analyses for a run (newest first): `{ analyses: [{ id, runId,
provider, model, status (PENDING|COMPLETED|FAILED), output, error,
createdAt }] }`. `output` is the validated structured analysis
(`summary`, `observed_findings`, `supporting_run_ids`,
`statistical_evidence`, `limitations`, `possible_explanations`,
`recommended_experiments`, `confidence`).

---

## Settings

### GET /api/v1/settings

`{ settings, defaults }` where settings is:

```json
{
  "ai": { "provider": "zai | ollama | disabled", "model": null,
          "ollamaUrl": "http://localhost:11434", "temperature": 0.2 },
  "defaults": { "warmup": 2, "repetitions": 5, "timeoutMs": 180000, "seed": 20261016 },
  "regressionThresholdPct": 10
}
```

### PUT /api/v1/settings

Body: a partial settings object, merged with current settings. Validation:
Ollama requires a base URL; repetitions ≥ 2; warmup ≥ 0. Responses: `200 {
settings }` · `400` invalid JSON · `422` validation error.

---

## End-to-end workflow with curl

```sh
BASE=http://localhost:3000/api/v1

# 0. check the service and engines
curl -s "$BASE/health"
curl -s "$BASE/languages" | python3 -m json.tool

# 1. create an experiment
EXP=$(curl -s -X POST "$BASE/experiments" -H "Content-Type: application/json" -d '{
  "name": "Sorting shootout",
  "description": "merge vs std sort, three languages",
  "config": {
    "variants": ["sorting.merge_sort", "sorting.std_sort"],
    "languages": ["cpp", "java", "python"],
    "datasetType": "random_int",
    "inputSizes": [10000],
    "repetitions": 5
  }
}' | python3 -c "import json,sys; print(json.load(sys.stdin)['id'])")
echo "experiment: $EXP"

# 2. start a run (202 → runId; execution is serial and asynchronous)
RUN=$(curl -s -X POST "$BASE/experiments/$EXP/run" \
  | python3 -c "import json,sys; print(json.load(sys.stdin)['runId'])")
echo "run: $RUN"

# 3. poll until COMPLETED / FAILED / CANCELLED
while :; do
  STATUS=$(curl -s "$BASE/runs/$RUN" | python3 -c "import json,sys; print(json.load(sys.stdin)['status'])")
  echo "status: $STATUS"
  case "$STATUS" in COMPLETED|FAILED|CANCELLED) break;; esac
  sleep 5
done

# live log tail (incremental): GET "$BASE/runs/$RUN?afterLogId=<last log id>"

# 4. results with statistics, verification status and raw observations
curl -s "$BASE/experiments/$EXP/results?runId=$RUN" | python3 -m json.tool | less

# 5. re-run the same experiment for a comparison baseline/candidate pair
RUN2=$(curl -s -X POST "$BASE/experiments/$EXP/run" \
  | python3 -c "import json,sys; print(json.load(sys.stdin)['runId'])")
# … poll as above …

# 6. regression comparison between the two runs
curl -s "$BASE/comparisons?baseline=$RUN&candidate=$RUN2" | python3 -m json.tool

# 7. markdown report (also available: json, csv)
curl -s -X POST "$BASE/reports" -H "Content-Type: application/json" \
  -d "{\"runId\": \"$RUN2\", \"format\": \"markdown\"}" \
  | python3 -c "import json,sys; print(json.load(sys.stdin)['content'])"

# 8. optional AI analysis of a finished run
curl -s -X POST "$BASE/ai/analysis" -H "Content-Type: application/json" \
  -d "{\"runId\": \"$RUN2\"}"
curl -s "$BASE/ai/analysis?runId=$RUN2" | python3 -m json.tool | less
```

Cancellation, if needed:

```sh
curl -s -X POST "$BASE/experiments/$EXP/cancel"
```

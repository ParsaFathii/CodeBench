# AI insights

CodeBench includes an optional AI layer that interprets finished runs. It is
strictly a read-only commentator: it never computes statistics, never
touches benchmark records, and the platform works fully without it.

## Provider abstraction

`src/lib/ai/provider.ts` defines a small adapter interface (`status()` /
`complete()`) with three implementations, selected in settings
(`PUT /api/v1/settings` → `ai.provider`):

| Provider | What it is | When to use it |
|---|---|---|
| `zai` | The built-in `z-ai-web-dev-sdk` backend, called server-side. Default in this environment. | Zero-config operation where the SDK is available. |
| `ollama` | Locally hosted models via an OLLama base URL (default `http://localhost:11434`, configurable). The adapter lists installed models and calls `/api/chat` with `format: json`. | Self-hosting with privacy constraints — evidence stays on the machine. |
| `disabled` | No provider; analyses fail with an explicit error. | Running a benchmark-only deployment. |

`GET /api/v1/ai/status` reports the configured provider, live availability
and the model it would use. Availability never blocks core benchmarking
features.

## What the model receives

The evidence payload is built in `buildEvidence()` (`src/lib/ai/analyze.ts`)
**exclusively from rows stored in the database for the analyzed run**:

- `runId`, `runStatus`, the experiment name and its config;
- an environment summary (OS, arch, CPU model, core count, isolation
  policy) from the run's environment snapshot;
- per completed result: variant key/name, category, language, input size,
  dataset, verification status, `refMatch`, `crossLangMatch`, and the
  computed statistics (n, median, mean, stddev, cv, p95, min, max,
  stability, outlier count, extra metrics such as Java's allocation rate);
- per failed job: variant key, language, input size and the (truncated)
  error message.

What it never receives: the raw observation arrays (only statistics
computed from them), the raw harness output, database credentials or any
other run's data. Because the payload contains only stored results, no
number can enter the analysis that was not measured — the prompt cannot be
used to fabricate evidence.

The system prompt additionally binds the model to eight rules, including:
every quantitative claim must come from the payload; only reference
variants/languages/sizes present in the evidence; "insufficient evidence" is
a valid answer; distinguish measured facts, computed statistics, hypotheses
and recommendations; do not present results as a universal language
ranking; respond with a single JSON object matching the schema.

## Structured output schema

The model's response is parsed and validated (zod) against:

| Field | Type / limit | Content |
|---|---|---|
| `summary` | string, ≤ 2000 chars | Overall reading of the run |
| `observed_findings` | ≤ 20 strings, ≤ 1000 chars each | Facts tied to specific variant / language / size |
| `supporting_run_ids` | ≤ 10 strings, ≤ 64 chars | Must be exactly the analyzed run's id |
| `statistical_evidence` | ≤ 20 strings | Numbers cited from the payload (CV, medians, deltas) |
| `limitations` | ≤ 20 strings | Caveats: environment specificity, small n, unstable results |
| `possible_explanations` | ≤ 20 strings | Explicitly hypotheses, not measurements |
| `recommended_experiments` | ≤ 20 strings | Follow-up runs worth doing |
| `confidence` | `high` \| `medium` \| `low` | The model's own assessed confidence |

Anything that does not parse (after stripping optional markdown fences and
extracting the outermost JSON object) or does not validate is rejected; the
analysis row is stored as `FAILED` with the error.

## Grounding validation

After schema validation, `checkGrounding()` verifies the analysis against
the evidence:

- **Run ids:** every entry in `supporting_run_ids` must equal the analyzed
  run's id. References to foreign runs are rejected.
- **Variant references:** snake_case tokens appearing in the summary,
  findings, statistical evidence or explanations are matched against the
  variant keys present in the run. A token that looks like one of our
  variant ids (checked against the known id list and variant-id prefixes)
  but is not part of the run marks the analysis as referencing something
  that was not measured.

A rejected analysis is stored with status `FAILED` and an error of the form
`analysis rejected (ungrounded): …`, and the API returns `502`. The
unvalidated output is preserved in the row's `outputJson` for inspection.

## Storage and separation

Each analysis is persisted as an `AiAnalysis` row: provider, model, status
(`PENDING` / `COMPLETED` / `FAILED`), `inputJson` (the exact evidence
payload sent — full auditability of what the model saw), `outputJson` (the
validated structured output) and `error`.

Separation guarantees:

- The AI layer writes **only** to the `AiAnalysis` table. There is no code
  path from the AI subsystem to experiments, runs, results, logs or reports.
- Deterministic reports (`src/lib/bench/reports.ts`) intentionally exclude
  AI output — all numbers in a report derive from stored raw observations.
- Statistics are computed by `stats.ts` before and independently of any AI
  involvement.

## Analysis lifecycle

`POST /api/v1/ai/analysis` is asynchronous in shape but executes within the
request: an `AiAnalysis` row is created as `PENDING` with the exact
`inputJson` before the provider is called, then updated to `COMPLETED`
(validated, grounded output stored) or `FAILED` (provider error, schema
violation, grounding rejection, or an empty run — "no completed results to
analyze"). The route returns `202 { analysisId }` on success and `502` with
the error message otherwise; the stored row always preserves what went
wrong, so failures are auditable after the fact.

Provider parameters: the configured `temperature` (default 0.2 — low, to
keep the output close to the evidence) and a completion timeout (90
seconds) enforced by a promise race. The z-ai adapter calls the SDK with
thinking disabled; the Ollama adapter requests `format: "json"` so the
model is steered toward parseable JSON in the first place.

Multiple analyses can be run for the same run (e.g. after switching
providers); `GET /api/v1/ai/analysis?runId=…` lists them newest first with
their provider and model, so it is always visible which backend produced
which interpretation.

## Practical expectations

- The analysis is an interpretation aid, not an oracle. The grounding check
  constrains *which* variants and run ids may be referenced, but the prose
  quality still depends on the model; `possible_explanations` are
  hypotheses by design and must be tested against new runs, not quoted as
  facts.
- `confidence: "low"` combined with limitations about unstable results
  (CV ≥ 10%) or tiny samples is the model correctly declining to
  over-claim. Treat that as the signal it is.
- If the AI layer is disabled or unreachable, nothing else degrades:
  benchmarking, statistics, comparisons and reports do not involve it.

## Using it

```sh
# provider availability
curl -s http://localhost:3000/api/v1/ai/status

# analyze a finished run (202 on success; 502 on provider/grounding failure)
curl -s -X POST http://localhost:3000/api/v1/ai/analysis \
  -H "Content-Type: application/json" -d '{"runId": "clx…"}'

# read stored analyses for the run
curl -s "http://localhost:3000/api/v1/ai/analysis?runId=clx…" | python3 -m json.tool
```

Preconditions: the run must exist and be finished (`COMPLETED` or `FAILED`;
a still-executing run returns `409`), and it must have at least one
completed result — an empty run fails with an explicit error rather than
producing an analysis of nothing.


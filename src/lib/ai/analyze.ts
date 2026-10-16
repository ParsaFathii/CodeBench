// CodeBench — AI analysis over REAL measured evidence
//
// The model receives only the normalized results that actually exist in the
// database for the selected run (no fabricated numbers can enter through the
// prompt). Its structured output is validated against a schema and grounded
// against the run's variant set; analyses referencing unknown variants or
// foreign run ids are rejected. AI output is stored separately and can never
// modify benchmark records.

import { z } from "zod";
import { db } from "@/lib/db";
import { getSettings } from "@/lib/bench/settings";
import { getProvider } from "./provider";
import type { Stats } from "@/lib/bench/spec";

const AiAnalysisOutput = z.object({
  summary: z.string().min(1).max(2000),
  observed_findings: z.array(z.string().min(1).max(1000)).max(20),
  supporting_run_ids: z.array(z.string().max(64)).max(10),
  statistical_evidence: z.array(z.string().min(1).max(1000)).max(20),
  limitations: z.array(z.string().min(1).max(1000)).max(20),
  possible_explanations: z.array(z.string().min(1).max(1000)).max(20),
  recommended_experiments: z.array(z.string().min(1).max(1000)).max(20),
  confidence: z.enum(["high", "medium", "low"]),
});

export type AiAnalysisOutput = z.infer<typeof AiAnalysisOutput>;

const SYSTEM_PROMPT = `You are a careful performance-engineering analyst embedded in CodeBench, a cross-language algorithm benchmarking platform.

You will receive a JSON evidence payload containing the REAL measured results of one benchmark run: per-result statistics computed from raw observations, verification statuses, harness metadata and the environment snapshot.

Rules you MUST follow:
1. Every quantitative claim must come from the evidence payload. Never invent, estimate or extrapolate numbers.
2. Only reference algorithms, variants, languages and input sizes that appear in the evidence.
3. If the evidence is insufficient for a conclusion, say so explicitly — "insufficient evidence" is a valid and respected answer.
4. Distinguish clearly between: measured facts, computed statistics, possible explanations (hypotheses), and recommendations for further testing.
5. Do not present the results as a universal language ranking. Timings are environment-specific.
6. Respond with a single JSON object, no markdown fences, exactly matching this schema:
{
  "summary": string,
  "observed_findings": string[],
  "supporting_run_ids": string[],
  "statistical_evidence": string[],
  "limitations": string[],
  "possible_explanations": string[],
  "recommended_experiments": string[],
  "confidence": "high" | "medium" | "low"
}
7. supporting_run_ids must contain only the run id given in the evidence.
8. Keep each finding short, specific and tied to the data (mention variant, language and input size).`;

export interface EvidencePayload {
  runId: string;
  runStatus: string;
  experiment: { name: string; config: unknown };
  environment: {
    os: string;
    arch: string;
    cpu: string | null;
    cores: number | null;
    isolation: string;
  } | null;
  results: Array<{
    variantKey: string;
    variantName: string;
    category: string;
    language: string;
    inputSize: number;
    dataset: string;
    verification: string;
    refMatch: boolean | null;
    crossLangMatch: boolean;
    n: number;
    medianNs: number;
    meanNs: number;
    stddevNs: number;
    cv: number;
    p95Ns: number;
    minNs: number;
    maxNs: number;
    stability: string;
    outliers: number;
    extraMetrics?: Record<string, number>;
  }>;
  failures: Array<{ variantKey: string; language: string; inputSize: number; error: string }>;
}

export async function buildEvidence(runId: string): Promise<EvidencePayload> {
  const run = await db.run.findUnique({
    where: { id: runId },
    include: { experiment: true, results: true },
  });
  if (!run) throw new Error("run not found");
  const env = run.envSnapshotId ? await db.envSnapshot.findUnique({ where: { id: run.envSnapshotId } }) : null;

  const results: EvidencePayload["results"] = [];
  const failures: EvidencePayload["failures"] = [];
  for (const r of run.results) {
    if (r.status !== "COMPLETED") {
      failures.push({
        variantKey: `${r.algorithmId}.${r.variantId}`,
        language: r.language,
        inputSize: r.inputSize,
        error: (r.error ?? "unknown error").slice(0, 300),
      });
      continue;
    }
    const stats = r.statsJson ? (JSON.parse(r.statsJson) as Stats) : null;
    if (!stats) continue;
    results.push({
      variantKey: `${r.algorithmId}.${r.variantId}`,
      variantName: r.variantName,
      category: r.category,
      language: r.language,
      inputSize: r.inputSize,
      dataset: r.datasetType,
      verification: r.verificationStatus,
      refMatch: r.refMatch,
      crossLangMatch: r.crossLangMatch,
      n: stats.n,
      medianNs: round(stats.median),
      meanNs: round(stats.mean),
      stddevNs: round(stats.stddev),
      cv: round(stats.cv, 5),
      p95Ns: round(stats.p95),
      minNs: round(stats.min),
      maxNs: round(stats.max),
      stability: stats.stability,
      outliers: stats.outliersIqr.length,
      extraMetrics: r.extraMetricsJson ? JSON.parse(r.extraMetricsJson) : undefined,
    });
  }

  return {
    runId: run.id,
    runStatus: run.status,
    experiment: {
      name: run.experiment.name,
      config: JSON.parse(run.experiment.config),
    },
    environment: env
      ? {
          os: `${env.osPlatform} ${env.osVersion}`,
          arch: env.arch,
          cpu: env.cpuModel,
          cores: env.cpuCores,
          isolation: "serial, one OS process per benchmark job",
        }
      : null,
    results,
    failures,
  };
}

function round(x: number, digits = 1): number {
  const f = 10 ** digits;
  return Math.round(x * f) / f;
}

function extractJson(text: string): unknown {
  let t = text.trim();
  // strip optional markdown fences
  t = t.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
  // find the outermost JSON object if the model prefixed prose
  const start = t.indexOf("{");
  const end = t.lastIndexOf("}");
  if (start >= 0 && end > start) t = t.slice(start, end + 1);
  return JSON.parse(t);
}

/** Grounding check: every variant key mentioned in the analysis must exist in the run. */
function checkGrounding(output: AiAnalysisOutput, evidence: EvidencePayload): string[] {
  const knownKeys = new Set(evidence.results.map((r) => r.variantKey));
  const knownLangs = new Set(evidence.results.map((r) => r.language));
  const problems: string[] = [];
  const allText = [
    output.summary,
    ...output.observed_findings,
    ...output.statistical_evidence,
    ...output.possible_explanations,
  ].join(" \n ");
  const keyPattern = /[a-z]+_[a-z_]+/g;
  const mentioned = allText.match(keyPattern) ?? [];
  for (const m of mentioned) {
    if (m.includes("_") && !knownKeys.has(m) && isVariantLike(m)) {
      problems.push(`references "${m}" which is not part of this run`);
    }
  }
  for (const rid of output.supporting_run_ids) {
    if (rid !== evidence.runId) problems.push(`references run id "${rid}" which was not analyzed`);
  }
  void knownLangs;
  return problems;
}

function isVariantLike(s: string): boolean {
  // heuristic: snake_case tokens that look like our variant ids (not ordinary words)
  const known = [
    "merge_sort", "quick_sort", "heap_sort", "insertion_sort", "std_sort",
    "linear_search", "binary_search", "hash_lookup", "dynamic_array", "queue_ops",
    "priority_queue_ops", "pq_std", "hash_map_ops", "bfs", "dfs", "dijkstra",
    "naive_search", "kmp", "matmul_naive", "matmul_ikj",
    "sorting", "search", "datastructures", "graphs", "strings", "matrix",
  ];
  return known.includes(s) || /^(matmul|hash|binary|linear|naive|quick|merge|heap|insertion|priority|queue|dynamic|std)/.test(s);
}

export async function runAiAnalysis(runId: string): Promise<{ analysisId: string }> {
  const settings = await getSettings();
  const provider = getProvider(settings);
  const evidence = await buildEvidence(runId);

  const record = await db.aiAnalysis.create({
    data: {
      runId,
      provider: settings.ai.provider,
      model: settings.ai.provider === "zai" ? "z-ai (server-side SDK)" : settings.ai.model,
      status: "PENDING",
      inputJson: JSON.stringify(evidence),
    },
  });

  if (evidence.results.length === 0) {
    await db.aiAnalysis.update({
      where: { id: record.id },
      data: { status: "FAILED", error: "run has no completed results to analyze" },
    });
    throw new Error("run has no completed results to analyze");
  }

  try {
    const userPrompt = `Evidence payload (real measurements from the database):\n\n${JSON.stringify(
      evidence,
      null,
      1
    )}\n\nAnalyze this benchmark run. The run id is ${runId}. Respond with the JSON object only.`;

    const raw = await provider.complete(
      [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userPrompt },
      ],
      settings.ai.temperature,
      90_000
    );

    const parsed = AiAnalysisOutput.parse(extractJson(raw));
    const groundingProblems = checkGrounding(parsed, evidence);
    if (groundingProblems.length > 0) {
      await db.aiAnalysis.update({
        where: { id: record.id },
        data: {
          status: "FAILED",
          error: `analysis rejected (ungrounded): ${groundingProblems.join("; ")}`,
          outputJson: JSON.stringify(parsed),
        },
      });
      throw new Error(`AI analysis rejected — ${groundingProblems.join("; ")}`);
    }

    await db.aiAnalysis.update({
      where: { id: record.id },
      data: { status: "COMPLETED", outputJson: JSON.stringify(parsed) },
    });
    return { analysisId: record.id };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await db.aiAnalysis
      .update({ where: { id: record.id }, data: { status: "FAILED", error: message.slice(0, 2000) } })
      .catch(() => undefined);
    throw err;
  }
}

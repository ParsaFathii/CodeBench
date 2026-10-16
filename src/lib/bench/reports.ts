// CodeBench — reproducible report generation (JSON / CSV / Markdown)
//
// Reports contain the experiment definition, per-result statistics, raw
// observation references, verification status, environment metadata and the
// comparison methodology. AI interpretation is never mixed into these
// deterministic reports.

import { db } from "@/lib/db";
import type { Stats } from "./spec";
import { formatNs } from "./stats";

export type ReportFormat = "json" | "csv" | "markdown";

export async function generateReport(runId: string, format: ReportFormat) {
  const run = await db.run.findUnique({
    where: { id: runId },
    include: {
      experiment: true,
      results: { orderBy: [{ algorithmId: "asc" }, { variantId: "asc" }, { inputSize: "asc" }, { language: "asc" }] },
    },
  });
  if (!run) throw new Error("run not found");
  const env = run.envSnapshotId ? await db.envSnapshot.findUnique({ where: { id: run.envSnapshotId } }) : null;
  const config = JSON.parse(run.experiment.config);

  const baseName = `codebench-run-${run.id.slice(-8)}`;

  if (format === "json") {
    const payload = {
      reportVersion: "1.0.0",
      generatedAt: new Date().toISOString(),
      run: {
        id: run.id,
        status: run.status,
        commitSha: run.commitSha,
        startedAt: run.startedAt,
        finishedAt: run.finishedAt,
        totalJobs: run.totalJobs,
        completedJobs: run.completedJobs,
        failedJobs: run.failedJobs,
        error: run.error,
      },
      experiment: { id: run.experiment.id, name: run.experiment.name, description: run.experiment.description, config },
      environment: env,
      methodology: {
        benchmarkMode: "avgt (ns per operation)",
        warmupPolicy: "explicit warm-up operations/iterations before measurement (per language harness)",
        repetitions: config.repetitions,
        isolation: "serial execution, one OS process per job",
        fairness:
          "identical SplitMix64-generated inputs across languages; FNV-1a 64 checksums verify input/output equivalence; hand-written and standard-library variants are labelled separately",
        statistics: "mean/median/stddev/percentiles/CV/95% t-CI computed from raw observations; outliers retained and flagged via the IQR rule",
        limitations: [
          "timings reflect the recorded environment only and are not universal language rankings",
          "Java hash-map/hash-lookup variants box Long keys; CPython measured with PYTHONHASHSEED=0",
          "single machine, virtualized CPU — treat small differences (< practical threshold) as inconclusive",
        ],
      },
      results: run.results.map((r) => ({
        algorithm: r.algorithmId,
        variant: r.variantId,
        variantName: r.variantName,
        category: r.category,
        language: r.language,
        dataset: r.datasetType,
        inputSize: r.inputSize,
        seed: r.seed,
        harness: `${r.harness} ${r.harnessVersion ?? ""}`.trim(),
        verificationStatus: r.verificationStatus,
        refMatch: r.refMatch,
        crossLangMatch: r.crossLangMatch,
        observations: JSON.parse(r.observations) as number[],
        stats: r.statsJson ? (JSON.parse(r.statsJson) as Stats) : null,
        extraMetrics: r.extraMetricsJson ? JSON.parse(r.extraMetricsJson) : null,
        env: r.envJson ? JSON.parse(r.envJson) : null,
        warnings: r.warnings,
        status: r.status,
        error: r.error,
      })),
    };
    return {
      filename: `${baseName}.json`,
      content: JSON.stringify(payload, null, 2),
      contentType: "application/json",
    };
  }

  if (format === "csv") {
    const header = [
      "algorithm", "variant", "category", "language", "dataset", "input_size", "seed",
      "harness", "verification", "ref_match", "cross_lang_match", "status",
      "n_obs", "min_ns", "max_ns", "mean_ns", "median_ns", "stddev_ns", "cv", "p95_ns", "stability",
    ].join(",");
    const lines = [header];
    for (const r of run.results) {
      const stats = r.statsJson ? (JSON.parse(r.statsJson) as Stats) : null;
      const obs = JSON.parse(r.observations) as number[];
      lines.push(
        [
          r.algorithmId, r.variantId, r.category, r.language, r.datasetType, r.inputSize, r.seed,
          `${r.harness}-${r.harnessVersion ?? "?"}`, r.verificationStatus, r.refMatch ?? "", r.crossLangMatch, r.status,
          obs.length,
          stats ? stats.min.toFixed(1) : "", stats ? stats.max.toFixed(1) : "",
          stats ? stats.mean.toFixed(1) : "", stats ? stats.median.toFixed(1) : "",
          stats ? stats.stddev.toFixed(1) : "", stats ? stats.cv.toFixed(4) : "",
          stats ? stats.p95.toFixed(1) : "", stats?.stability ?? "",
        ].join(",")
      );
    }
    return { filename: `${baseName}.csv`, content: lines.join("\n"), contentType: "text/csv" };
  }

  // markdown
  const md: string[] = [];
  md.push(`# CodeBench Run Report`);
  md.push("");
  md.push(`- **Experiment:** ${run.experiment.name}`);
  md.push(`- **Run:** \`${run.id}\``);
  md.push(`- **Status:** ${run.status}${run.error ? ` — ${run.error}` : ""}`);
  md.push(`- **Commit:** ${run.commitSha ?? "unavailable"}`);
  md.push(`- **Started / Finished:** ${run.startedAt?.toISOString() ?? "—"} / ${run.finishedAt?.toISOString() ?? "—"}`);
  md.push(`- **Jobs:** ${run.completedJobs}/${run.totalJobs} completed, ${run.failedJobs} failed`);
  md.push("");
  md.push(`## Configuration`);
  md.push("");
  md.push("```json");
  md.push(JSON.stringify(config, null, 2));
  md.push("```");
  md.push("");
  if (env) {
    md.push(`## Environment`);
    md.push("");
    md.push(`- OS: ${env.osPlatform} ${env.osVersion} (${env.arch})`);
    md.push(`- CPU: ${env.cpuModel ?? "unavailable"} × ${env.cpuCores ?? "?"}`);
    md.push(`- Memory: ${env.totalMemBytes ? `${(Number(env.totalMemBytes) / 1024 ** 3).toFixed(1)} GiB` : "unavailable"}`);
    md.push(`- Isolation: serial, one process per job`);
    md.push("");
  }
  md.push(`## Results`);
  md.push("");
  md.push(`| Algorithm | Variant | Category | Language | n | Median | Mean ± σ | CV | Verification |`);
  md.push(`|---|---|---|---|---|---|---|---|---|`);
  for (const r of run.results) {
    const stats = r.statsJson ? (JSON.parse(r.statsJson) as Stats) : null;
    md.push(
      `| ${r.algorithmId} | ${r.variantName} | ${r.category} | ${r.language} | ${r.inputSize} | ${
        stats ? formatNs(stats.median) : "—"
      } | ${stats ? `${formatNs(stats.mean)} ± ${formatNs(stats.stddev)}` : "—"} | ${
        stats ? `${(stats.cv * 100).toFixed(1)}%` : "—"
      } | ${r.verificationStatus}${r.refMatch === false ? " (ref FAILED)" : ""} |`
    );
  }
  md.push("");
  md.push(`## Methodology and limitations`);
  md.push("");
  md.push(`- Warm-up: ${config.warmup} warm-up units before measurement (per-harness semantics).`);
  md.push(`- Repetitions: ${config.repetitions} measured observations stored per result.`);
  md.push(`- Inputs are generated deterministically (SplitMix64, seed ${config.seed}) and verified bit-identical across languages via FNV-1a 64 checksums.`);
  md.push(`- Hand-written and standard-library variants are separate categories; the latter reflects library engineering as well as the language runtime.`);
  md.push(`- Timings are specific to the environment above and must not be read as universal language rankings.`);
  md.push(`- AI-generated interpretation is intentionally excluded from this report; all numbers derive from stored raw observations.`);
  return {
    filename: `${baseName}.md`,
    content: md.join("\n"),
    contentType: "text/markdown",
  };
}

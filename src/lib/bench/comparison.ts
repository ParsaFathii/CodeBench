// CodeBench — baseline comparison / regression analysis
//
// Two runs are compared only when their workload definitions match. The
// verdict uses a configurable practical-significance threshold plus the
// combined run-to-run variation; when the evidence cannot support a call,
// the result is INCONCLUSIVE — never a fabricated regression.

import { db } from "@/lib/db";
import type { ComparisonReport, ComparisonRow, Language, Stats } from "./spec";

export async function compareRuns(
  baselineRunId: string,
  candidateRunId: string,
  regressionThresholdPct: number
): Promise<ComparisonReport> {
  const [baseline, candidate] = await Promise.all([
    db.run.findUnique({ where: { id: baselineRunId }, include: { results: true, experiment: true } }),
    db.run.findUnique({ where: { id: candidateRunId }, include: { results: true, experiment: true } }),
  ]);
  if (!baseline || !candidate) throw new Error("baseline or candidate run not found");

  const notes: string[] = [];
  let comparability: ComparisonReport["comparability"] = "comparable";

  const bc = JSON.parse(baseline.experiment.config);
  const cc = JSON.parse(candidate.experiment.config);
  const workloadKeys = ["variants", "languages", "datasetType", "inputSizes", "seed"];
  for (const k of workloadKeys) {
    if (JSON.stringify(bc[k]) !== JSON.stringify(cc[k])) {
      comparability = "workload-differs";
      notes.push(`workload property "${k}" differs between the two runs — the comparison is not rigorous`);
    }
  }

  const envA = baseline.envSnapshotId ? await db.envSnapshot.findUnique({ where: { id: baseline.envSnapshotId } }) : null;
  const envB = candidate.envSnapshotId ? await db.envSnapshot.findUnique({ where: { id: candidate.envSnapshotId } }) : null;
  if (envA && envB) {
    if ((envA.cpuModel ?? "") !== (envB.cpuModel ?? "") || envA.cpuCores !== envB.cpuCores) {
      if (comparability === "comparable") comparability = "environment-differs";
      notes.push("CPU model or core count differs between runs — treat timing differences with caution");
    }
    if ((envA.commitSha ?? "") !== (envB.commitSha ?? "")) {
      notes.push("project commit differs between runs (intended for regression analysis across versions)");
    }
  }

  interface Row {
    key: string;
    algorithmId: string;
    variantId: string;
    language: string;
    inputSize: number;
    datasetType: string;
    stats: Stats;
    verification: string;
    refMatch: boolean | null;
  }
  const toMap = (run: typeof baseline): Map<string, Row> => {
    const m = new Map<string, Row>();
    for (const r of run.results) {
      if (r.status !== "COMPLETED") continue;
      const stats = r.statsJson ? (JSON.parse(r.statsJson) as Stats) : null;
      if (!stats) continue;
      m.set(`${r.algorithmId}.${r.variantId}|${r.language}|${r.inputSize}`, {
        key: `${r.algorithmId}.${r.variantId}`,
        algorithmId: r.algorithmId,
        variantId: r.variantId,
        language: r.language,
        inputSize: r.inputSize,
        datasetType: r.datasetType,
        stats,
        verification: r.verificationStatus,
        refMatch: r.refMatch,
      });
    }
    return m;
  };

  const baseMap = toMap(baseline);
  const candMap = toMap(candidate);
  const allKeys = new Set([...baseMap.keys(), ...candMap.keys()]);

  const rows: ComparisonRow[] = [];
  for (const key of Array.from(allKeys).sort()) {
    const a = baseMap.get(key);
    const b = candMap.get(key);
    const [variantKey, language, size] = key.split("|");
    const [algorithmId, variantId] = variantKey.split(".");

    const row: ComparisonRow = {
      algorithmId,
      variantId,
      variantKey,
      language: language as Language,
      inputSize: Number(size),
      datasetType: (a ?? b)!.datasetType,
      baselineMedian: a ? a.stats.median : null,
      candidateMedian: b ? b.stats.median : null,
      deltaPct: null,
      ratio: null,
      baselineCV: a ? a.stats.cv : null,
      candidateCV: b ? b.stats.cv : null,
      combinedCV: null,
      verdict: "NO-DATA",
    };

    if (!a || !b) {
      row.verdict = "NO-DATA";
      row.note = !a ? "missing in baseline run" : "missing in candidate run";
      rows.push(row);
      continue;
    }
    if (a.verification === "FAILED" || b.verification === "FAILED" || a.refMatch === false || b.refMatch === false) {
      row.verdict = "NOT-COMPARABLE";
      row.note = "verification failed on at least one side — measurements are not valid";
      rows.push(row);
      continue;
    }

    const delta = b.stats.median - a.stats.median;
    const deltaPct = a.stats.median !== 0 ? (delta / a.stats.median) * 100 : 0;
    const ratio = a.stats.median !== 0 ? b.stats.median / a.stats.median : null;
    row.deltaPct = deltaPct;
    row.ratio = ratio;
    row.combinedCV = Math.sqrt((a.stats.cv || 0) ** 2 + (b.stats.cv || 0) ** 2);

    const threshold = regressionThresholdPct;
    const noisePct = (row.combinedCV || 0) * 100;
    if (Math.abs(deltaPct) < threshold) {
      row.verdict = "INCONCLUSIVE";
      row.note = `|Δ| ${Math.abs(deltaPct).toFixed(1)}% < practical threshold ${threshold}%`;
    } else if (Math.abs(deltaPct) < noisePct) {
      row.verdict = "INCONCLUSIVE";
      row.note = `change ${deltaPct.toFixed(1)}% is within combined run-to-run variation (±${noisePct.toFixed(1)}%)`;
    } else {
      row.verdict = deltaPct > 0 ? "REGRESSION" : "IMPROVEMENT";
      row.note = `candidate is ${deltaPct > 0 ? "slower" : "faster"} by ${Math.abs(deltaPct).toFixed(1)}% (median)`;
    }
    rows.push(row);
  }

  return {
    baselineRunId,
    candidateRunId,
    comparability,
    comparabilityNotes: notes,
    regressionThresholdPct,
    rows,
    generatedAt: new Date().toISOString(),
  };
}

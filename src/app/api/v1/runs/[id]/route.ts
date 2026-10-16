// GET /api/v1/runs/[id] — run detail: status, logs (live console), results summary
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const afterLogId = req.nextUrl.searchParams.get("afterLogId");

  const run = await db.run.findUnique({
    where: { id },
    include: { experiment: true },
  });
  if (!run) return NextResponse.json({ error: "run not found" }, { status: 404 });

  const logs = await db.runLog.findMany({
    where: afterLogId ? { runId: id, id: { gt: afterLogId } } : { runId: id },
    orderBy: { ts: "asc" },
    take: 500,
  });

  const results = await db.benchmarkResult.findMany({
    where: { runId: id },
    orderBy: [{ createdAt: "asc" }],
  });

  const env = run.envSnapshotId
    ? await db.envSnapshot.findUnique({ where: { id: run.envSnapshotId } })
    : null;

  return NextResponse.json({
    id: run.id,
    experimentId: run.experimentId,
    experimentName: run.experiment.name,
    config: JSON.parse(run.experiment.config),
    status: run.status,
    progress: run.progress,
    totalJobs: run.totalJobs,
    completedJobs: run.completedJobs,
    failedJobs: run.failedJobs,
    currentJob: run.currentJob,
    commitSha: run.commitSha,
    startedAt: run.startedAt,
    finishedAt: run.finishedAt,
    createdAt: run.createdAt,
    error: run.error,
    logs: logs.map((l) => ({ id: l.id, ts: l.ts, level: l.level, message: l.message })),
    results: results.map((r) => ({
      id: r.id,
      variantKey: `${r.algorithmId}.${r.variantId}`,
      algorithmId: r.algorithmId,
      algorithmName: r.algorithmName,
      variantId: r.variantId,
      variantName: r.variantName,
      category: r.category,
      language: r.language,
      datasetType: r.datasetType,
      inputSize: r.inputSize,
      verificationStatus: r.verificationStatus,
      refMatch: r.refMatch,
      crossLangMatch: r.crossLangMatch,
      status: r.status,
      observations: JSON.parse(r.observations),
      stats: r.statsJson ? JSON.parse(r.statsJson) : null,
      extraMetrics: r.extraMetricsJson ? JSON.parse(r.extraMetricsJson) : null,
      warnings: r.warnings,
      error: r.error,
      durationMs: r.durationMs,
      createdAt: r.createdAt,
    })),
    environment: env,
  });
}

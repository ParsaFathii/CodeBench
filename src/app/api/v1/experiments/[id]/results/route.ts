// GET /api/v1/experiments/[id]/results — all results across the experiment's runs
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const runId = req.nextUrl.searchParams.get("runId");
  const experiment = await db.experiment.findUnique({ where: { id } });
  if (!experiment) return NextResponse.json({ error: "experiment not found" }, { status: 404 });

  const runs = await db.run.findMany({
    where: { experimentId: id },
    orderBy: { createdAt: "desc" },
    select: { id: true },
  });
  if (runs.length === 0) return NextResponse.json({ results: [] });

  const results = await db.benchmarkResult.findMany({
    where: runId ? { runId } : { runId: { in: runs.map((r) => r.id) } },
    orderBy: [{ createdAt: "asc" }],
  });

  return NextResponse.json({
    results: results.map((r) => ({
      id: r.id,
      runId: r.runId,
      algorithmId: r.algorithmId,
      algorithmName: r.algorithmName,
      variantId: r.variantId,
      variantName: r.variantName,
      variantKey: `${r.algorithmId}.${r.variantId}`,
      category: r.category,
      language: r.language,
      datasetType: r.datasetType,
      inputSize: r.inputSize,
      seed: r.seed,
      harness: r.harness,
      harnessVersion: r.harnessVersion,
      verificationStatus: r.verificationStatus,
      refMatch: r.refMatch,
      crossLangMatch: r.crossLangMatch,
      status: r.status,
      observations: JSON.parse(r.observations),
      stats: r.statsJson ? JSON.parse(r.statsJson) : null,
      extraMetrics: r.extraMetricsJson ? JSON.parse(r.extraMetricsJson) : null,
      env: r.envJson ? JSON.parse(r.envJson) : null,
      warnings: r.warnings,
      durationMs: r.durationMs,
      error: r.error,
      createdAt: r.createdAt,
    })),
  });
}

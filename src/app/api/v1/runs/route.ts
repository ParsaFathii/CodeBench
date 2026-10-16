// GET /api/v1/runs — run history with the active run surfaced
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { repairStaleRuns } from "@/lib/bench/coordinator";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  await repairStaleRuns();
  const status = req.nextUrl.searchParams.get("status");
  const limit = Math.min(100, Number(req.nextUrl.searchParams.get("limit") ?? 50) || 50);

  const runs = await db.run.findMany({
    where: status ? { status } : undefined,
    orderBy: { createdAt: "desc" },
    take: limit,
    include: {
      experiment: { select: { name: true, config: true } },
      _count: { select: { results: true } },
    },
  });

  const active = runs.find((r) =>
    ["QUEUED", "PREPARING", "RUNNING", "VERIFYING", "ANALYZING"].includes(r.status)
  );

  return NextResponse.json({
    activeRunId: active?.id ?? null,
    runs: runs.map((r) => ({
      id: r.id,
      experimentId: r.experimentId,
      experimentName: r.experiment.name,
      config: JSON.parse(r.experiment.config),
      status: r.status,
      progress: r.progress,
      totalJobs: r.totalJobs,
      completedJobs: r.completedJobs,
      failedJobs: r.failedJobs,
      currentJob: r.currentJob,
      resultCount: r._count.results,
      commitSha: r.commitSha,
      startedAt: r.startedAt,
      finishedAt: r.finishedAt,
      createdAt: r.createdAt,
      error: r.error,
    })),
  });
}

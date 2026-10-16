// GET /api/v1/experiments/[id] — experiment detail with its runs
import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const experiment = await db.experiment.findUnique({
    where: { id },
    include: {
      runs: {
        orderBy: { createdAt: "desc" },
        select: {
          id: true, status: true, progress: true, totalJobs: true, completedJobs: true,
          failedJobs: true, startedAt: true, finishedAt: true, createdAt: true, error: true, currentJob: true,
        },
      },
    },
  });
  if (!experiment) return NextResponse.json({ error: "experiment not found" }, { status: 404 });
  return NextResponse.json({
    id: experiment.id,
    name: experiment.name,
    description: experiment.description,
    config: JSON.parse(experiment.config),
    createdAt: experiment.createdAt,
    runs: experiment.runs,
  });
}

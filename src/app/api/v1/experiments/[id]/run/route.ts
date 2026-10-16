// POST /api/v1/experiments/[id]/run — schedule a new run of the experiment
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { startRun } from "@/lib/bench/coordinator";
import { repairStaleRuns } from "@/lib/bench/coordinator";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const experiment = await db.experiment.findUnique({ where: { id } });
  if (!experiment) return NextResponse.json({ error: "experiment not found" }, { status: 404 });
  try {
    await repairStaleRuns();
    const { runId } = await startRun(id);
    return NextResponse.json({ runId }, { status: 202 });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 409 }
    );
  }
}

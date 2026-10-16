// POST /api/v1/experiments/[id]/cancel — cancel the active run of this experiment
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requestCancel } from "@/lib/bench/coordinator";

export const dynamic = "force-dynamic";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const active = await db.run.findFirst({
    where: { experimentId: id, status: { in: ["QUEUED", "PREPARING", "RUNNING", "VERIFYING", "ANALYZING"] } },
    orderBy: { createdAt: "desc" },
  });
  if (!active) return NextResponse.json({ error: "no active run for this experiment" }, { status: 409 });
  const ok = await requestCancel(active.id);
  return NextResponse.json({ cancelled: ok, runId: active.id }, { status: ok ? 202 : 409 });
}

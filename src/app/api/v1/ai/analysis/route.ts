// /api/v1/ai/analysis — evidence-grounded AI interpretation of a run
// POST : { runId } — run the analysis (validated, grounded, stored)
// GET  : ?runId= — list analyses for a run
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { runAiAnalysis } from "@/lib/ai/analyze";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }
  const { runId } = body as { runId?: string };
  if (!runId) return NextResponse.json({ error: "runId is required" }, { status: 422 });
  const run = await db.run.findUnique({ where: { id: runId } });
  if (!run) return NextResponse.json({ error: "run not found" }, { status: 404 });
  if (!["COMPLETED", "FAILED"].includes(run.status)) {
    return NextResponse.json({ error: "run is still executing — wait for it to finish" }, { status: 409 });
  }
  try {
    const { analysisId } = await runAiAnalysis(runId);
    return NextResponse.json({ analysisId }, { status: 202 });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 502 }
    );
  }
}

export async function GET(req: NextRequest) {
  const runId = req.nextUrl.searchParams.get("runId");
  if (!runId) return NextResponse.json({ error: "runId is required" }, { status: 400 });
  const analyses = await db.aiAnalysis.findMany({
    where: { runId },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json({
    analyses: analyses.map((a) => ({
      id: a.id,
      runId: a.runId,
      provider: a.provider,
      model: a.model,
      status: a.status,
      output: a.outputJson ? JSON.parse(a.outputJson) : null,
      error: a.error,
      createdAt: a.createdAt,
    })),
  });
}

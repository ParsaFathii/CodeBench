// GET /api/v1/runs/[id]/raw?resultId=... — preserved raw harness output
// (no resultId: raw outputs index for the run)
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const resultId = req.nextUrl.searchParams.get("resultId");

  if (!resultId) {
    const results = await db.benchmarkResult.findMany({
      where: { runId: id, status: "COMPLETED" },
      select: { id: true, algorithmId: true, variantId: true, language: true, inputSize: true, harness: true },
      orderBy: { createdAt: "asc" },
    });
    return NextResponse.json({
      runId: id,
      rawResults: results.map((r) => ({
        id: r.id,
        label: `${r.algorithmId}.${r.variantId} [${r.language}] n=${r.inputSize}`,
        harness: r.harness,
      })),
    });
  }

  const result = await db.benchmarkResult.findFirst({ where: { id: resultId, runId: id } });
  if (!result) return NextResponse.json({ error: "result not found" }, { status: 404 });

  return NextResponse.json({
    id: result.id,
    label: `${result.algorithmId}.${result.variantId} [${result.language}] n=${result.inputSize}`,
    harness: result.harness,
    harnessVersion: result.harnessVersion,
    env: result.envJson ? JSON.parse(result.envJson) : null,
    observations: JSON.parse(result.observations),
    rawOutput: result.rawOutput,
  });
}

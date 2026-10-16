// GET /api/v1/comparisons?baseline=...&candidate=... — regression analysis between two runs
import { NextRequest, NextResponse } from "next/server";
import { compareRuns } from "@/lib/bench/comparison";
import { getSettings } from "@/lib/bench/settings";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const baseline = req.nextUrl.searchParams.get("baseline");
  const candidate = req.nextUrl.searchParams.get("candidate");
  if (!baseline || !candidate) {
    return NextResponse.json({ error: "baseline and candidate run ids are required" }, { status: 400 });
  }
  if (baseline === candidate) {
    return NextResponse.json({ error: "baseline and candidate must be different runs" }, { status: 422 });
  }
  try {
    const settings = await getSettings();
    const report = await compareRuns(baseline, candidate, settings.regressionThresholdPct);
    return NextResponse.json(report);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 404 }
    );
  }
}

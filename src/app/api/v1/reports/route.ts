// /api/v1/reports — reproducible run reports
// GET  : list reports for a run
// POST : generate { runId, format } and persist
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { generateReport, type ReportFormat } from "@/lib/bench/reports";

export const dynamic = "force-dynamic";

const FORMATS: ReportFormat[] = ["json", "csv", "markdown"];

export async function GET(req: NextRequest) {
  const runId = req.nextUrl.searchParams.get("runId");
  const download = req.nextUrl.searchParams.get("download");
  if (!runId) return NextResponse.json({ error: "runId is required" }, { status: 400 });

  if (download) {
    const report = await db.report.findUnique({ where: { id: download } });
    if (!report || report.runId !== runId) {
      return NextResponse.json({ error: "report not found" }, { status: 404 });
    }
    return new NextResponse(report.content, {
      headers: {
        "Content-Type": report.format === "csv" ? "text/csv" : report.format === "json" ? "application/json" : "text/markdown",
        "Content-Disposition": `attachment; filename="${report.filename}"`,
      },
    });
  }

  const reports = await db.report.findMany({
    where: { runId },
    orderBy: { createdAt: "desc" },
    select: { id: true, format: true, filename: true, createdAt: true },
  });
  return NextResponse.json({ reports });
}

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }
  const { runId, format } = body as { runId?: string; format?: string };
  if (!runId || !FORMATS.includes(format as ReportFormat)) {
    return NextResponse.json({ error: `runId and format (${FORMATS.join("/")}) are required` }, { status: 422 });
  }
  try {
    const generated = await generateReport(runId, format as ReportFormat);
    const report = await db.report.create({
      data: {
        runId,
        format,
        filename: generated.filename,
        content: generated.content,
      },
    });
    return NextResponse.json(
      { id: report.id, filename: report.filename, format, contentType: generated.contentType, content: generated.content },
      { status: 201 }
    );
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 404 });
  }
}

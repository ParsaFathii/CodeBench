// GET /api/v1/health — service health and version information
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    status: "ok",
    service: "codebench",
    version: "1.0.0",
    time: new Date().toISOString(),
  });
}

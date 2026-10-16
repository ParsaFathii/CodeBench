// /api/v1/settings — application settings
import { NextRequest, NextResponse } from "next/server";
import { getSettings, saveSettings, DEFAULT_SETTINGS, type AppSettings } from "@/lib/bench/settings";

export const dynamic = "force-dynamic";

export async function GET() {
  const settings = await getSettings();
  return NextResponse.json({ settings, defaults: DEFAULT_SETTINGS });
}

export async function PUT(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }
  try {
    const settings = await saveSettings(body as Partial<AppSettings>);
    return NextResponse.json({ settings });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 422 }
    );
  }
}

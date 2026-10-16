// GET /api/v1/ai/status — AI provider availability (never blocks core features)
import { NextResponse } from "next/server";
import { getSettings } from "@/lib/bench/settings";
import { getProvider } from "@/lib/ai/provider";

export const dynamic = "force-dynamic";

export async function GET() {
  const settings = await getSettings();
  const provider = getProvider(settings);
  const status = await provider.status();
  return NextResponse.json({
    configured: settings.ai.provider,
    ...status,
    note:
      "AI interpretation is optional and strictly separated from measurements. The benchmark engine works fully without it.",
  });
}

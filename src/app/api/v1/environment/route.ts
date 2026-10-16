// GET /api/v1/environment — host + engine metadata (only what is actually available)
import { NextResponse } from "next/server";
import { captureEnvironment } from "@/lib/bench/env";
import { checkAllEngines } from "@/lib/bench/engines/paths";

export const dynamic = "force-dynamic";

export async function GET() {
  const [env, engines] = await Promise.all([captureEnvironment(null), checkAllEngines()]);
  return NextResponse.json({ environment: env, engines });
}

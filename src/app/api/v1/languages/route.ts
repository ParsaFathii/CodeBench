// GET /api/v1/languages — supported languages with live engine availability
import { NextResponse } from "next/server";
import { checkAllEngines } from "@/lib/bench/engines/paths";

export const dynamic = "force-dynamic";

export async function GET() {
  const engines = await checkAllEngines();
  return NextResponse.json({
    languages: [
      { id: "cpp", name: "C++", standard: "C++20", harness: "Google Benchmark", color: "amber" },
      { id: "java", name: "Java", standard: "Java 21 (Temurin)", harness: "JMH", color: "rose" },
      { id: "python", name: "Python", standard: "CPython 3.12", harness: "pyperf", color: "emerald" },
    ],
    engines,
  });
}

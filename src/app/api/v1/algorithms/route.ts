// GET /api/v1/algorithms — the verified algorithm catalog
import { NextResponse } from "next/server";
import { ALGORITHMS, buildCatalog, WORKLOAD_SPEC_VERSION } from "@/lib/bench/registry";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    workloadSpecVersion: WORKLOAD_SPEC_VERSION,
    algorithms: ALGORITHMS,
    catalog: buildCatalog(),
  });
}

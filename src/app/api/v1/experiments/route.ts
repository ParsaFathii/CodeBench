// /api/v1/experiments — experiment management
// GET  : list experiments (with latest run summary)
// POST : create an experiment (validated)
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { validateConfig } from "@/lib/bench/coordinator";
import { DEFAULT_CONFIG, type ExperimentConfig } from "@/lib/bench/spec";
import { getSettings } from "@/lib/bench/settings";

export const dynamic = "force-dynamic";

export async function GET() {
  const experiments = await db.experiment.findMany({
    orderBy: { createdAt: "desc" },
    include: { runs: { orderBy: { createdAt: "desc" }, take: 1 } },
  });
  return NextResponse.json({
    experiments: experiments.map((e) => {
      const lastRun = e.runs[0] ?? null;
      return {
        id: e.id,
        name: e.name,
        description: e.description,
        config: JSON.parse(e.config),
        createdAt: e.createdAt,
        runCount: e.runs.length,
        lastRun: lastRun
          ? { id: lastRun.id, status: lastRun.status, createdAt: lastRun.createdAt, progress: lastRun.progress }
          : null,
      };
    }),
  });
}

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }
  const b = body as Record<string, unknown>;
  const name = typeof b.name === "string" ? b.name.trim() : "";
  if (!name || name.length > 120) {
    return NextResponse.json({ error: "name is required (max 120 chars)" }, { status: 400 });
  }
  const description = typeof b.description === "string" ? b.description.slice(0, 2000) : null;

  const settings = await getSettings();
  const config: ExperimentConfig = {
    ...DEFAULT_CONFIG,
    ...(b.config as Partial<ExperimentConfig> | undefined),
    defaults: undefined,
  } as ExperimentConfig;
  // apply stored defaults for anything the caller omitted
  const raw = (b.config ?? {}) as Record<string, unknown>;
  if (raw.warmup === undefined) config.warmup = settings.defaults.warmup;
  if (raw.repetitions === undefined) config.repetitions = settings.defaults.repetitions;
  if (raw.timeoutMs === undefined) config.timeoutMs = settings.defaults.timeoutMs;
  if (raw.seed === undefined) config.seed = settings.defaults.seed;

  const validation = validateConfig(config);
  if (!validation.valid) {
    return NextResponse.json({ error: "invalid configuration", details: validation.errors }, { status: 422 });
  }

  const experiment = await db.experiment.create({
    data: { name, description, config: JSON.stringify(config) },
  });
  return NextResponse.json(
    { id: experiment.id, name: experiment.name, config, warnings: validation.warnings },
    { status: 201 }
  );
}

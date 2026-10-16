// POST /api/v1/experiments/[id]/clone — clone the experiment definition
import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const experiment = await db.experiment.findUnique({ where: { id } });
  if (!experiment) return NextResponse.json({ error: "experiment not found" }, { status: 404 });
  const clone = await db.experiment.create({
    data: {
      name: `${experiment.name} (clone)`,
      description: experiment.description,
      config: experiment.config,
    },
  });
  return NextResponse.json({ id: clone.id, name: clone.name }, { status: 201 });
}

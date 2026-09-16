import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

export const dynamic = "force-dynamic";

/**
 * Adding a stage to one house.
 *
 * The 32 standard stages cover a normal build, and no build is entirely
 * normal — a pool, a retaining wall, a granny flat, a heritage overlay, a
 * second driveway crossing. Without this he either leaves them off the board,
 * which makes the owner's page quietly wrong, or bends an existing stage to
 * mean something else, which makes his own records wrong.
 *
 * Added here it affects this house only. The standard list for future houses
 * is edited separately, on purpose: most one-offs genuinely are one-offs, and
 * a list that grows every time someone builds a pool stops being a checklist.
 */

const create = z.object({
  houseId: z.string().uuid(),
  name: z.string().trim().min(1).max(120),
  phase: z.string().trim().max(60).optional(),
  /** Insert directly after this stage. Omitted means the end of the list. */
  afterId: z.string().uuid().optional(),
  plannedDays: z.number().int().min(0).max(400).optional(),
});

export async function POST(req: NextRequest) {
  if (!(await getServerSession(authOptions))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = create.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const { houseId, name, phase, afterId, plannedDays } = parsed.data;

  const stages = await prisma.houseStage.findMany({
    where: { houseId },
    select: { id: true, position: true, phase: true },
    orderBy: { position: "asc" },
  });
  if (stages.length === 0) {
    return NextResponse.json({ error: "House not found" }, { status: 404 });
  }

  // Positions are floats precisely so a stage can be dropped between two
  // others without renumbering the rest — which would rewrite the ordering of
  // a build already underway.
  let position: number;
  let inheritedPhase: string | null = null;

  if (afterId) {
    const index = stages.findIndex((s) => s.id === afterId);
    if (index === -1) {
      return NextResponse.json({ error: "That stage isn't on this house." }, { status: 400 });
    }
    const before = stages[index];
    const after = stages[index + 1];
    position = after ? (before.position + after.position) / 2 : before.position + 1;
    inheritedPhase = before.phase;
  } else {
    position = (stages[stages.length - 1]?.position ?? 0) + 1;
    inheritedPhase = stages[stages.length - 1]?.phase ?? null;
  }

  const stage = await prisma.houseStage.create({
    data: {
      houseId,
      name,
      // Owners see phases, not stages. A new one with no phase would vanish
      // from their page entirely, so it takes the phase of whatever it follows.
      phase: phase || inheritedPhase,
      position,
      plannedDays: plannedDays ?? null,
      status: "not_started",
    },
    select: { id: true, name: true },
  });

  return NextResponse.json(stage, { status: 201 });
}

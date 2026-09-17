import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

export const dynamic = "force-dynamic";

/**
 * One stage, marked across several lots at once.
 *
 * This is the difference between the board being true and the board being
 * fiction on estate work. A gang does lots 14 to 19 in a run and finishes them
 * within a day of each other; marking that six times through six page loads is
 * a job that does not get done, and once the board is stale everything
 * downstream is quietly lying — the owner pages, the forecast, the Friday
 * email.
 *
 * Matched by stage NAME rather than id, because the ids differ per house and
 * "the frame is done on these six" is the actual thought.
 */

const body = z.object({
  houseIds: z.array(z.string().uuid()).min(1).max(100),
  stageName: z.string().trim().min(1).max(120),
  status: z.enum([
    "not_started",
    "scheduled",
    "in_progress",
    "on_hold",
    "complete",
    "not_applicable",
  ]),
});

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!(session?.user as { id?: string } | undefined)?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = body.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const { houseIds, stageName, status } = parsed.data;

  const stages = await prisma.houseStage.findMany({
    where: { houseId: { in: houseIds }, name: stageName },
    select: { id: true, houseId: true, startedAt: true, status: true },
  });

  if (stages.length === 0) {
    return NextResponse.json(
      { error: `None of those houses have a stage called "${stageName}".` },
      { status: 404 }
    );
  }

  const now = new Date();
  let changed = 0;

  for (const stage of stages) {
    if (stage.status === status) continue;
    await prisma.houseStage.update({
      where: { id: stage.id },
      data: {
        status,
        startedAt: status === "in_progress" ? stage.startedAt ?? now : stage.startedAt,
        completedAt: status === "complete" ? now : null,
      },
    });
    changed++;
  }

  // Deliberately silent to owners. Marking six lots is record keeping; six
  // milestone emails going out together, each claiming to be a personal note
  // about that family's house, is the opposite of what this product is for.
  // He sends those one at a time, from each house, or not at all.
  return NextResponse.json({
    changed,
    skipped: stages.length - changed,
    missing: houseIds.length - stages.length,
  });
}

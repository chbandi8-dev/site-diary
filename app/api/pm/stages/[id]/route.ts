import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { milestoneCopyFor } from "@/lib/stage-copy";
import { z } from "zod";

export const dynamic = "force-dynamic";

/**
 * Moving a stage.
 *
 * Several stages are legitimately underway at once — brickwork while the roof
 * is tiled — so this sets one stage's status and never implies anything about
 * the others. Marking a stage complete does not complete the ones before it.
 *
 * Deliberately does NOT touch progress claims. A claim is a contractually
 * defined scope; a mistap here must never move an invoice.
 */

const patch = z.object({
  status: z.enum(["not_started", "scheduled", "in_progress", "on_hold", "complete", "not_applicable"]),
});

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!(session?.user as { id?: string } | undefined)?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = patch.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  const stage = await prisma.houseStage.findUnique({
    where: { id: params.id },
    select: { id: true, startedAt: true, name: true, status: true },
  });
  if (!stage) return NextResponse.json({ error: "Stage not found" }, { status: 404 });

  const now = new Date();
  const { status } = parsed.data;

  await prisma.houseStage.update({
    where: { id: stage.id },
    data: {
      status,
      startedAt: status === "in_progress" ? stage.startedAt ?? now : stage.startedAt,
      completedAt: status === "complete" ? now : null,
    },
  });

  // Finishing a milestone is the best trigger in the app: he has just told us
  // something the owner genuinely cares about, at the moment it happened, and
  // it costs him nothing extra. A suggestion is returned rather than an update
  // being sent — he still decides, and most stages return nothing at all
  // because owners do not want an email about under-slab plumbing.
  const suggested =
    status === "complete" && stage.status !== "complete" ? milestoneCopyFor(stage.name) : null;

  return NextResponse.json({ ok: true, suggested, stageName: stage.name });
}

/**
 * Removing a stage from a house.
 *
 * Refused once anything is filed against it. Updates and photos would survive —
 * the database nulls the link rather than deleting them — but "this photo was
 * from the frame stage" is exactly the context that makes a two-year-old photo
 * worth anything in a dispute, and losing it silently is worse than leaving a
 * stage on the board. Marking it not applicable keeps both.
 */
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  if (!(await getServerSession(authOptions))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const stage = await prisma.houseStage.findUnique({
    where: { id: params.id },
    select: {
      id: true,
      name: true,
      _count: { select: { updates: true, photos: true, inspections: true } },
    },
  });
  if (!stage) return NextResponse.json({ ok: true });

  const attached =
    stage._count.updates + stage._count.photos + stage._count.inspections;
  if (attached > 0) {
    return NextResponse.json(
      {
        error: `${stage.name} has ${attached} update${attached === 1 ? "" : "s"} or photo${
          attached === 1 ? "" : "s"
        } filed against it, so it stays. Set it to N/A instead — it drops off the owner's page either way.`,
      },
      { status: 409 }
    );
  }

  await prisma.houseStage.delete({ where: { id: stage.id } });
  return NextResponse.json({ ok: true });
}

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
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
    select: { id: true, startedAt: true },
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

  return NextResponse.json({ ok: true });
}

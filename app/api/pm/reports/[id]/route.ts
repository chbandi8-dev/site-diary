import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { deliverNow } from "@/lib/notify";
import { z } from "zod";

/**
 * Acknowledging and replying to an owner report.
 *
 * The reply triggers the owner's notification in the database (see
 * supabase/migrations/0002_notify.sql), so nothing here has to remember to
 * send it.
 */

const patch = z.object({
  acknowledge: z.boolean().optional(),
  reply: z.string().trim().min(1).max(4000).optional(),
  status: z.enum(["in_progress", "resolved", "no_action_needed"]).optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = patch.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const { acknowledge, reply, status } = parsed.data;

  const existing = await prisma.ownerReport.findUnique({
    where: { id: params.id },
    select: { id: true, status: true, acknowledgedAt: true },
  });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (acknowledge && !reply) {
    if (existing.acknowledgedAt) return NextResponse.json({ ok: true });
    await prisma.ownerReport.update({
      where: { id: params.id },
      data: { acknowledgedAt: new Date(), status: "acknowledged" },
    });
    return NextResponse.json({ ok: true });
  }

  if (!reply) {
    return NextResponse.json(
      { error: "Every report gets an answer — write a line before closing it." },
      { status: 400 }
    );
  }

  const resolved = status === "resolved" || status === "no_action_needed";
  await prisma.ownerReport.update({
    where: { id: params.id },
    data: {
      replyBody: reply,
      repliedAt: new Date(),
      repliedById: userId,
      status: status ?? "resolved",
      resolvedAt: resolved ? new Date() : null,
      acknowledgedAt: existing.acknowledgedAt ?? new Date(),
    },
  });

  // The reply notification is queued by a database trigger, so it needs the
  // same nudge as everything else.
  await deliverNow();

  return NextResponse.json({ ok: true });
}

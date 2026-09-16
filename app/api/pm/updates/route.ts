import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { queue, ownersOf, deliverNow } from "@/lib/notify";
import { z } from "zod";

export const dynamic = "force-dynamic";

/**
 * An update in his own words, rather than from a template.
 *
 * Templates cover the recurring days; this covers everything else. Same
 * delivery path, same hold-before-sending option — a delay written by hand
 * deserves the phone call just as much as a templated one does.
 */

const create = z.object({
  houseId: z.string().uuid(),
  body: z.string().trim().min(1).max(4000),
  kind: z.enum(["progress", "delay", "milestone", "weather", "message"]).default("progress"),
  photoIds: z.array(z.string().uuid()).max(12).default([]),
  hold: z.boolean().default(false),
  /**
   * Which stage this is about. Optional, and usually filled in for him from
   * whatever is underway — an update filed against nothing is still a fine
   * update, but one filed against the frame is what makes a photo worth
   * finding again in two years.
   */
  stageId: z.string().uuid().optional(),
});

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = create.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const { houseId, body, kind, photoIds, hold, stageId } = parsed.data;

  const house = await prisma.house.findUnique({
    where: { id: houseId },
    select: { id: true, address: true },
  });
  if (!house) return NextResponse.json({ error: "House not found" }, { status: 404 });

  // Checked against this house rather than trusted, so a stale picker on a
  // page left open cannot file today's update against another build.
  let stage: string | null = null;
  if (stageId) {
    const found = await prisma.houseStage.findFirst({
      where: { id: stageId, houseId },
      select: { id: true },
    });
    if (!found) {
      return NextResponse.json({ error: "That stage isn't on this house." }, { status: 400 });
    }
    stage = found.id;
  }

  // A delay always drafts, however it was written. The rule is about what the
  // message does to the reader, not about where the words came from.
  const publish = !hold && kind !== "delay";
  const now = new Date();

  const update = await prisma.$transaction(async (tx) => {
    const created = await tx.update.create({
      data: {
        houseId,
        kind,
        body,
        stageId: stage,
        authorId: userId,
        occurredAt: now,
        publishedAt: publish ? now : null,
        publishedById: publish ? userId : null,
      },
      select: { id: true },
    });

    if (photoIds.length) {
      // The photos inherit the stage too. A photo is far more often what
      // someone goes looking for later than the words around it.
      await tx.photo.updateMany({
        where: { id: { in: photoIds }, houseId, status: "ready", updateId: null },
        data: { updateId: created.id, stageId: stage },
      });
    }

    return created;
  });

  let notified = 0;
  if (publish) {
    const recipients = await ownersOf(houseId);
    notified = recipients.length;
    await queue(
      recipients.map((recipient) => ({
        recipient,
        dedupeKey: `update:${update.id}:${recipient.ownerId}`,
        subject: `${house.address} — today's update`,
        body: "",
        houseId,
        updateId: update.id,
      }))
    );
    await deliverNow();
  }

  return NextResponse.json(
    {
      id: update.id,
      published: publish,
      notified,
      message: publish
        ? notified
          ? `Sent to ${notified} owner${notified === 1 ? "" : "s"}.`
          : "Posted to their page. Nobody's signed up for emails on this one yet."
        : "Saved as a draft. Send it from below once you've made the call.",
    },
    { status: 201 }
  );
}

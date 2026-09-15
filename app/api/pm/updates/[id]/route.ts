import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { queue, ownersOf, deliverNow } from "@/lib/notify";
import { z } from "zod";

export const dynamic = "force-dynamic";

/**
 * Sending, editing and withdrawing an update.
 *
 * Every delay template deliberately saves as a draft so he can make the phone
 * call before the owner reads it. This is the other half of that: the screen
 * where he comes back afterwards and sends it, usually after editing in a
 * sentence of his own.
 *
 *   PATCH { body? }            revise a draft
 *   PATCH { publish: true }    send it, and notify
 *   DELETE                     take it off their page
 */

const patch = z.object({
  body: z.string().trim().min(1).max(4000).optional(),
  publish: z.boolean().optional(),
});

async function staffId() {
  const session = await getServerSession(authOptions);
  return (session?.user as { id?: string } | undefined)?.id ?? null;
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const userId = await staffId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = patch.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  const update = await prisma.update.findUnique({
    where: { id: params.id },
    select: {
      id: true,
      kind: true,
      publishedAt: true,
      deletedAt: true,
      house: { select: { id: true, address: true } },
    },
  });
  if (!update || update.deletedAt) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Editing after it has gone is not a revision, it is rewriting what somebody
  // already read and was emailed. Withdraw and write a new one instead.
  if (parsed.data.body && update.publishedAt) {
    return NextResponse.json(
      { error: "This has already been sent. Remove it and write a new one instead." },
      { status: 409 }
    );
  }

  if (parsed.data.body) {
    await prisma.update.update({
      where: { id: update.id },
      data: { body: parsed.data.body },
    });
  }

  if (!parsed.data.publish) return NextResponse.json({ ok: true, published: false });
  if (update.publishedAt) return NextResponse.json({ ok: true, published: true, notified: 0 });

  const now = new Date();
  await prisma.update.update({
    where: { id: update.id },
    data: { publishedAt: now, publishedById: userId },
  });

  const recipients = await ownersOf(update.house.id);
  const queued = await queue(
    recipients.map((recipient) => ({
      recipient,
      dedupeKey: `update:${update.id}:${recipient.email}`,
      subject: `${update.house.address} — an update on timing`,
      body: "",
      houseId: update.house.id,
      updateId: update.id,
    }))
  );

  await deliverNow();

  return NextResponse.json({
    ok: true,
    published: true,
    notified: queued.length,
    message: queued.length
      ? `Sent to ${queued.length} owner${queued.length === 1 ? "" : "s"}.`
      : "Posted to their page. Nobody's signed up for emails on this one yet.",
  });
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const userId = await staffId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const update = await prisma.update.findUnique({
    where: { id: params.id },
    select: { id: true, publishedAt: true },
  });
  if (!update) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Soft delete: it stops rendering on their page, but the row stays. Hard
  // deleting something an owner was already emailed about would leave the
  // notification log contradicting the database.
  //
  // Anything still queued is cancelled in the same breath. Sending is a
  // separate scheduled job, so an undo within the first minute usually catches
  // the email before it leaves — which is what makes the undo bar worth having.
  const [, cancelled] = await prisma.$transaction([
    prisma.update.update({
      where: { id: update.id },
      data: { deletedAt: new Date() },
    }),
    prisma.notificationLog.deleteMany({
      where: { updateId: update.id, status: "queued" },
    }),
  ]);

  return NextResponse.json({
    ok: true,
    wasPublished: Boolean(update.publishedAt),
    emailsStopped: cancelled.count,
  });
}

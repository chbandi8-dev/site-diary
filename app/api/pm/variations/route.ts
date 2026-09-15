import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { queue, ownersOf, deliverNow } from "@/lib/notify";
import { recordEvidence } from "@/lib/evidence";
import { siteUrl } from "@/lib/site-url";
import { money } from "@/lib/money";
import { z } from "zod";

export const dynamic = "force-dynamic";

/**
 * Variations — the only part of this product that touches money.
 *
 * A variation raised verbally on site and invoiced three months later is the
 * single most common source of a builder losing a payment argument. The whole
 * value here is the trail: raised on this date, sent on this date, agreed by
 * this person on this date after a code went to their own inbox.
 *
 * Because of that, rows do not get rewritten. A variation that has been sent
 * cannot have its amount edited — that would quietly change the thing the owner
 * agreed to. Getting it wrong means superseding it with a new one, which is
 * also how it works on paper.
 */

const create = z.object({
  houseId: z.string().uuid(),
  reference: z.string().trim().max(24).optional(),
  description: z.string().trim().min(1).max(2000),
  // Dollars in, cents stored. Negatives are legitimate — a credit for a
  // deleted item is a variation like any other.
  amount: z.number().finite().min(-1_000_000).max(1_000_000),
});

async function staffId(): Promise<string | null> {
  const session = await getServerSession(authOptions);
  return (session?.user as { id?: string } | undefined)?.id ?? null;
}

/** VO-01, VO-02… per house. Matches how they are referred to on site. */
async function nextReference(houseId: string): Promise<string> {
  const count = await prisma.variation.count({ where: { houseId } });
  return `VO-${String(count + 1).padStart(2, "0")}`;
}

export async function POST(req: NextRequest) {
  const uid = await staffId();
  if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = create.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const { houseId, description, amount } = parsed.data;

  const house = await prisma.house.findUnique({ where: { id: houseId }, select: { id: true } });
  if (!house) return NextResponse.json({ error: "House not found" }, { status: 404 });

  const amountCents = Math.round(amount * 100);

  // The reference is unique per house, and two taps in quick succession would
  // otherwise both compute the same next number. Retry rather than fail: he is
  // standing on a site, and "try again" is a worse answer than VO-04.
  for (let attempt = 0; attempt < 4; attempt++) {
    const reference = parsed.data.reference || (await nextReference(houseId));
    try {
      const variation = await prisma.variation.create({
        data: { houseId, reference, description, amountCents },
        select: { id: true, reference: true },
      });

      await recordEvidence({
        subject: "variation",
        subjectId: variation.id,
        event: "raised",
        actor: { type: "staff", id: uid },
        req,
        payload: { reference: variation.reference, amountCents, description },
      });

      return NextResponse.json(variation, { status: 201 });
    } catch (cause) {
      const taken =
        typeof cause === "object" &&
        cause !== null &&
        (cause as { code?: string }).code === "P2002";
      // A reference he typed himself is his to fix; one we generated is ours.
      if (!taken || parsed.data.reference) {
        return NextResponse.json(
          { error: taken ? "That reference is already used on this house." : "Couldn't save that." },
          { status: taken ? 409 : 500 }
        );
      }
    }
  }

  return NextResponse.json({ error: "Couldn't save that. Try again." }, { status: 500 });
}

const send = z.object({ id: z.string().uuid() });

/**
 * Sends it to the owners for agreement.
 *
 * Only a draft can be sent. Re-sending an already-sent variation would produce
 * a second "sent" date for one document, and the date is half the point.
 */
export async function PATCH(req: NextRequest) {
  const uid = await staffId();
  if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = send.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  const variation = await prisma.variation.findUnique({
    where: { id: parsed.data.id },
    select: {
      id: true,
      reference: true,
      description: true,
      amountCents: true,
      status: true,
      houseId: true,
      house: { select: { address: true } },
    },
  });
  if (!variation) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (variation.status !== "draft") {
    return NextResponse.json({ error: "That's already been sent." }, { status: 409 });
  }

  const recipients = await ownersOf(variation.houseId);
  if (recipients.length === 0) {
    return NextResponse.json(
      {
        error:
          "Nobody on this house has given you an email address yet, so there's no one to send it to.",
      },
      { status: 409 }
    );
  }

  const sent = await prisma.variation.update({
    where: { id: variation.id },
    data: { status: "sent", sentAt: new Date() },
    select: { id: true, status: true, sentAt: true },
  });

  await recordEvidence({
    subject: "variation",
    subjectId: variation.id,
    event: "sent",
    actor: { type: "staff", id: uid },
    req,
    payload: { to: recipients.map((r) => r.email) },
  });

  await queue(
    recipients.map((recipient) => ({
      recipient,
      dedupeKey: `variation-sent:${variation.id}:${recipient.ownerId}`,
      subject: `${variation.house.address} — variation ${variation.reference} for your approval`,
      body: [
        `${variation.description}`,
        ``,
        `${money(variation.amountCents)}`,
        ``,
        `Nothing is charged and no work starts on this until you agree to it. Open your build page to approve or decline:`,
        `${siteUrl()}/my`,
        ``,
        `You'll be asked for a short code, which we'll email to this address — that's what puts your name on the decision.`,
      ].join("\n"),
      houseId: variation.houseId,
    }))
  );

  await deliverNow();

  return NextResponse.json(sent);
}

/** Only a draft can be withdrawn. Anything the owner has seen is a record. */
export async function DELETE(req: NextRequest) {
  const uid = await staffId();
  if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  const deleted = await prisma.variation.deleteMany({ where: { id, status: "draft" } });
  if (deleted.count === 0) {
    return NextResponse.json(
      { error: "That's already gone to the owner, so it stays on the record." },
      { status: 409 }
    );
  }

  await recordEvidence({
    subject: "variation",
    subjectId: id,
    event: "withdrawn",
    actor: { type: "staff", id: uid },
    req,
  });

  return NextResponse.json({ ok: true });
}

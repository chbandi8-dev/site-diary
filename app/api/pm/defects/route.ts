import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { queue, ownersOf, deliverNow } from "@/lib/notify";
import { z } from "zod";

export const dynamic = "force-dynamic";

/**
 * The defects list.
 *
 * The tensest fortnight of any build. The owner has walked through with a
 * notepad, everything on it feels urgent to them and most of it is twenty
 * minutes of work; meanwhile they are about to hand over the last payment and
 * are looking for a reason not to.
 *
 * What defuses it is not speed, it is visibility. An owner who can see their
 * eleven items, six marked done with dates, stops ringing. So this list is
 * owner-facing from the moment it exists, and every item carries whose it was —
 * theirs or his own sweep — because "we found that ourselves before you did"
 * is worth a great deal at that particular moment.
 */

const create = z.object({
  houseId: z.string().uuid(),
  location: z.string().trim().max(120).optional(),
  description: z.string().trim().min(1).max(600),
  raisedByOwner: z.boolean().default(false),
  targetAt: z.string().date().optional(),
});

const update = z.object({
  id: z.string().uuid(),
  status: z.enum(["open", "in_progress", "resolved", "disputed"]),
});

async function staff(): Promise<boolean> {
  return Boolean(await getServerSession(authOptions));
}

export async function POST(req: NextRequest) {
  if (!(await staff())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = create.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const { houseId, location, description, raisedByOwner, targetAt } = parsed.data;

  const house = await prisma.house.findUnique({ where: { id: houseId }, select: { id: true } });
  if (!house) return NextResponse.json({ error: "House not found" }, { status: 404 });

  // Numbered per house, because that is how they get talked about on site and
  // in the email that follows the walk-through — "number seven is done".
  const count = await prisma.defect.count({ where: { houseId } });

  const defect = await prisma.defect.create({
    data: {
      houseId,
      reference: String(count + 1),
      location: location || null,
      description,
      raisedByOwner,
      targetAt: targetAt ? new Date(`${targetAt}T00:00:00.000Z`) : null,
    },
    select: { id: true, reference: true },
  });

  return NextResponse.json(defect, { status: 201 });
}

export async function PATCH(req: NextRequest) {
  if (!(await staff())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = update.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  const defect = await prisma.defect.findUnique({
    where: { id: parsed.data.id },
    select: { id: true, houseId: true, reference: true, description: true, status: true },
  });
  if (!defect) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const resolving = parsed.data.status === "resolved" && defect.status !== "resolved";

  await prisma.defect.update({
    where: { id: defect.id },
    data: {
      status: parsed.data.status,
      resolvedAt: parsed.data.status === "resolved" ? new Date() : null,
    },
  });

  // Told, not left to be noticed. An owner who has to re-walk the house to find
  // out what has been done is an owner still holding the final payment.
  if (resolving) {
    const house = await prisma.house.findUnique({
      where: { id: defect.houseId },
      select: { address: true },
    });
    const recipients = await ownersOf(defect.houseId);
    await queue(
      recipients.map((recipient) => ({
        recipient,
        dedupeKey: `defect-done:${defect.id}:${recipient.ownerId}`,
        subject: `${house?.address ?? "Your build"} — item ${defect.reference} is done`,
        body: [
          `${defect.description}`,
          ``,
          `That one's finished. You'll see it ticked off on your build page with the rest of the list.`,
        ].join("\n"),
        houseId: defect.houseId,
      }))
    );
    await deliverNow();
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  if (!(await staff())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  // An owner's own item is never removed from behind them: they wrote it down
  // on the walk-through and they will look for it. Dispute it instead, which
  // stays on the list with a reason.
  const deleted = await prisma.defect.deleteMany({ where: { id, raisedByOwner: false } });
  if (deleted.count === 0) {
    return NextResponse.json(
      { error: "That one came from the owner, so it stays on the list. Mark it disputed instead." },
      { status: 409 }
    );
  }

  return NextResponse.json({ ok: true });
}

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

export const dynamic = "force-dynamic";

/**
 * The two things on the owner's page that go stale fastest.
 *
 * `waitingOn` is the first line they read and the answer to most of the calls
 * he gets. Handover is the question they ask monthly and treat any answer to as
 * a promise, which is why it is stored and shown as a range.
 *
 * A handover change is recorded rather than overwritten: a moved date the owner
 * was never told about, discovered later, does more damage than the delay.
 */

const patch = z.object({
  // The details themselves. Until now there was no way to fix a mis-heard
  // address at all — a house dictated as "Went Worth Bill" stayed that way
  // forever, which is a poor answer to "the microphone got it wrong".
  address: z.string().trim().min(3).max(200).optional(),
  suburb: z.string().trim().max(120).nullable().optional(),
  lotNumber: z.string().trim().max(40).nullable().optional(),
  storeys: z.union([z.literal(1), z.literal(2)]).optional(),
  waitingOn: z.string().trim().max(200).nullable().optional(),
  waitingOnEta: z.string().date().nullable().optional(),
  handoverFrom: z.string().date().nullable().optional(),
  handoverTo: z.string().date().nullable().optional(),
  handoverReason: z.string().trim().max(500).optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!(session?.user as { id?: string } | undefined)?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = patch.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  const house = await prisma.house.findUnique({
    where: { id: params.id },
    select: { id: true, handoverFrom: true, handoverTo: true },
  });
  if (!house) return NextResponse.json({ error: "House not found" }, { status: 404 });

  const { handoverFrom, handoverTo, handoverReason, address, suburb, lotNumber, storeys, ...rest } =
    parsed.data;
  const nextFrom = handoverFrom === undefined ? house.handoverFrom : handoverFrom ? new Date(handoverFrom) : null;
  const nextTo = handoverTo === undefined ? house.handoverTo : handoverTo ? new Date(handoverTo) : null;

  const moved =
    nextFrom?.getTime() !== house.handoverFrom?.getTime() ||
    nextTo?.getTime() !== house.handoverTo?.getTime();

  await prisma.$transaction(async (tx) => {
    await tx.house.update({
      where: { id: house.id },
      data: {
        ...(address !== undefined ? { address } : {}),
        ...(suburb !== undefined ? { suburb: suburb || null } : {}),
        ...(lotNumber !== undefined ? { lotNumber: lotNumber || null } : {}),
        ...(storeys !== undefined ? { storeys } : {}),
        ...(rest.waitingOn !== undefined ? { waitingOn: rest.waitingOn } : {}),
        ...(rest.waitingOnEta !== undefined
          ? { waitingOnEta: rest.waitingOnEta ? new Date(rest.waitingOnEta) : null }
          : {}),
        ...(handoverFrom !== undefined ? { handoverFrom: nextFrom } : {}),
        ...(handoverTo !== undefined ? { handoverTo: nextTo } : {}),
      },
    });

    if (moved && nextFrom && nextTo) {
      await tx.handoverForecast.create({
        data: { houseId: house.id, from: nextFrom, to: nextTo, reason: handoverReason },
      });
    }
  });

  return NextResponse.json({ ok: true, handoverRecorded: moved });
}

/**
 * Deleting a house.
 *
 * Everything hanging off it goes with it — every stage, update, photo record,
 * variation, defect, wet day, note and owner link — because the database
 * cascades. That is not recoverable from inside the app, so this refuses to
 * run unless the address has been typed out in full. A confirm dialog is a
 * reflex; typing "14 Wattle Grove" is not.
 *
 * Most of the time the right answer is not this. A finished build should be
 * marked handed over, which keeps the record — and the record is the whole
 * point of a site diary the day somebody disputes what happened. This is for a
 * house entered by mistake, which after voice capture is the case that
 * actually comes up.
 *
 * Photo objects in R2 are not removed here; `scripts/sweep-orphan-photos.ts`
 * collects them separately, so the bucket lags the database by a sweep.
 */
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!(session?.user as { id?: string } | undefined)?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const house = await prisma.house.findUnique({
    where: { id: params.id },
    select: { id: true, address: true },
  });
  if (!house) return NextResponse.json({ error: "House not found" }, { status: 404 });

  // Typed, not clicked. Whitespace and case are forgiven; the words are not.
  const typed = (req.nextUrl.searchParams.get("confirm") ?? "").trim().replace(/\s+/g, " ");
  const expected = house.address.trim().replace(/\s+/g, " ");
  if (typed.toLowerCase() !== expected.toLowerCase()) {
    return NextResponse.json(
      { error: `Type the address exactly — ${house.address} — to delete it.` },
      { status: 400 }
    );
  }

  await prisma.house.delete({ where: { id: house.id } });
  return NextResponse.json({ ok: true, address: house.address });
}

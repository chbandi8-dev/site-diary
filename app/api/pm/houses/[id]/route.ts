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

  const { handoverFrom, handoverTo, handoverReason, ...rest } = parsed.data;
  const nextFrom = handoverFrom === undefined ? house.handoverFrom : handoverFrom ? new Date(handoverFrom) : null;
  const nextTo = handoverTo === undefined ? house.handoverTo : handoverTo ? new Date(handoverTo) : null;

  const moved =
    nextFrom?.getTime() !== house.handoverFrom?.getTime() ||
    nextTo?.getTime() !== house.handoverTo?.getTime();

  await prisma.$transaction(async (tx) => {
    await tx.house.update({
      where: { id: house.id },
      data: {
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

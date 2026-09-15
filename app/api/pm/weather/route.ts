import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

export const dynamic = "force-dynamic";

/**
 * The wet-day log.
 *
 * Under a standard HIA or MBA residential contract, days lost to inclement
 * weather entitle the builder to an extension of time — but only if they were
 * recorded as they happened. A log written from memory in March, covering
 * November, is worth very little when the owner disputes the handover date.
 *
 * Two things follow from that, and both are deliberate:
 *
 *   - The contractual test is whether WORK WAS LOST, not whether it rained. A
 *     wet Sunday costs nothing. A wet Tuesday that stops a slab pour costs a
 *     day, and sometimes several, because the site then has to dry out.
 *   - The note matters more than the rainfall figure. "Wet" invites an
 *     argument; "slab pour pushed to Thursday, site too soft for the pump"
 *     usually ends one.
 *
 * Entries are dated by the day they apply to, not the day they were typed, so
 * catching up on Friday for a wet Wednesday is normal and expected.
 */

const entry = z.object({
  houseId: z.string().uuid(),
  date: z.string().date(),
  workLost: z.boolean().default(true),
  note: z.string().trim().max(300).optional(),
  rainfallMm: z.number().min(0).max(1000).optional(),
});

async function staff(): Promise<boolean> {
  return Boolean(await getServerSession(authOptions));
}

export async function POST(req: NextRequest) {
  if (!(await staff())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = entry.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const { houseId, date, workLost, note, rainfallMm } = parsed.data;

  const day = new Date(`${date}T00:00:00.000Z`);
  if (day.getTime() > Date.now() + 86_400_000) {
    return NextResponse.json(
      { error: "You can't log a day that hasn't happened yet." },
      { status: 400 }
    );
  }

  const house = await prisma.house.findUnique({ where: { id: houseId }, select: { id: true } });
  if (!house) return NextResponse.json({ error: "House not found" }, { status: 404 });

  // Upsert on the day: logging the same date twice corrects it rather than
  // double-counting it, which would inflate an extension-of-time claim and
  // hand the owner a reason to reject the whole log.
  const row = await prisma.weatherDay.upsert({
    where: { houseId_date: { houseId, date: day } },
    update: { workLost, note: note ?? null, rainfallMm: rainfallMm ?? null, source: "pm" },
    create: {
      houseId,
      date: day,
      workLost,
      note: note ?? null,
      rainfallMm: rainfallMm ?? null,
      source: "pm",
    },
    select: { id: true, date: true, workLost: true },
  });

  return NextResponse.json(row, { status: 201 });
}

export async function DELETE(req: NextRequest) {
  if (!(await staff())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  const day = await prisma.weatherDay.findUnique({
    where: { id },
    select: { id: true, eotClaimedAt: true },
  });
  if (!day) return NextResponse.json({ ok: true });

  // A day already cited in an extension-of-time notice is part of a document
  // the owner has been sent. Removing it quietly would leave the notice
  // claiming a day the log no longer shows.
  if (day.eotClaimedAt) {
    return NextResponse.json(
      { error: "That day has already been claimed in a notice, so it stays on the log." },
      { status: 409 }
    );
  }

  await prisma.weatherDay.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}

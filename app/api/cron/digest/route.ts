import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { queue, ownersOf, flush } from "@/lib/notify";
import { composeDigest, isoWeek } from "@/lib/digest-text";

export const dynamic = "force-dynamic";

/**
 * The Friday digest.
 *
 * Goes out whether or not anything was logged. That is the entire point: a week
 * with no news is a week the owner spends wondering, and "nothing visible
 * happened, here's why, here's what's next" is a better message than silence.
 * It is also the safety net for the weeks he is underwater.
 *
 * Deduped on the ISO week, so re-running it on the same Friday sends nothing.
 */
async function run(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const since = new Date(Date.now() - 7 * 86_400_000);
  const week = isoWeek(new Date());

  // A look-ahead he dictated three weeks ago is worse than none: it describes a
  // week that has already been and gone. Ten days is generous enough to cover
  // writing it early and a digest that runs late, and short enough that a line
  // can never survive into a second Friday.
  const lookAheadFresh = new Date(Date.now() - 10 * 86_400_000);

  const houses = await prisma.house.findMany({
    where: { status: { in: ["active", "practical_completion"] } },
    select: {
      id: true,
      address: true,
      waitingOn: true,
      waitingOnEta: true,
      nextWeek: true,
      nextWeekSetAt: true,
      stages: {
        where: { status: "in_progress" },
        select: { name: true },
        orderBy: { position: "asc" },
      },
      updates: {
        where: { publishedAt: { not: null }, occurredAt: { gte: since }, deletedAt: null },
        select: { body: true, occurredAt: true },
        orderBy: { occurredAt: "asc" },
      },
      variations: {
        where: { status: "sent" },
        select: { reference: true },
      },
      weatherDays: {
        where: { workLost: true, date: { gte: since } },
        select: { date: true },
        orderBy: { date: "asc" },
      },
    },
  });

  let queued = 0;

  for (const house of houses) {
    const recipients = await ownersOf(house.id);
    if (recipients.length === 0) continue;

    const created = await queue(
      recipients.map((recipient) => ({
        recipient,
        dedupeKey: `digest:${week}:${house.id}:${recipient.ownerId}`,
        subject: `${house.address} — this week`,
        body: composeDigest(house, lookAheadFresh),
        houseId: house.id,
      }))
    );
    queued += created.length;
  }

  const { sent, failed } = await flush(200);
  return NextResponse.json({ houses: houses.length, queued, sent, failed });
}

/**
 * Both verbs. Vercel Cron issues GET; Supabase pg_net is usually POST. Exposing
 * only one of them fails silently forever — the queue simply never drains and
 * nothing anywhere says so.
 */
export const GET = run;
export const POST = run;

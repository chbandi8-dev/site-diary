import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { queue, ownersOf, flush } from "@/lib/notify";

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

type DigestHouse = {
  address: string;
  waitingOn: string | null;
  waitingOnEta: Date | null;
  nextWeek: string | null;
  nextWeekSetAt: Date | null;
  stages: { name: string }[];
  updates: { body: string; occurredAt: Date }[];
  variations: { reference: string }[];
  weatherDays: { date: Date }[];
};

/**
 * A quiet week is still a week worth writing about. The version that says
 * "nothing visible happened, here is why, here is what is next" is the one that
 * stops the Saturday drive-past turning into a Sunday phone call.
 */
function composeDigest(house: DigestHouse, lookAheadFresh: Date): string {
  const lines: string[] = [];

  if (house.updates.length > 0) {
    lines.push("This week at your place:", "");
    for (const u of house.updates) {
      const day = u.occurredAt.toLocaleDateString("en-AU", { weekday: "long", day: "numeric", month: "short" });
      lines.push(`${day} — ${u.body}`);
    }
  } else if (house.weatherDays.length > 0) {
    // The weather already explains the quiet week, and it must be allowed to.
    // The reassuring version below would have him telling an owner their dates
    // are safe in the same week he is logging the days that move them.
    lines.push("No work on site this week — the weather stopped us.");
  } else {
    lines.push(
      "No visible work on site this week. That is normal at some points in a build, " +
        "and it does not mean your dates have moved."
    );
  }

  // Days lost to weather, stated and no more. Any reassurance here — that the
  // dates still hold, that it is absorbed — is a sentence an owner can quote
  // back at him when he serves the extension-of-time notice these same days
  // support.
  if (house.weatherDays.length > 0) {
    const days = house.weatherDays.map((w) =>
      w.date.toLocaleDateString("en-AU", { weekday: "long" })
    );
    lines.push(
      "",
      house.weatherDays.length === 1
        ? `We lost ${days[0]} to the weather.`
        : `We lost ${house.weatherDays.length} days to the weather: ${days.join(", ")}.`
    );
  }

  lines.push("");

  // The part they cannot see for themselves, and the reason for the Thursday
  // screen. A digest that only recaps the week just gone tells them what the
  // photos already showed.
  if (house.nextWeek && house.nextWeekSetAt && house.nextWeekSetAt >= lookAheadFresh) {
    lines.push("Next week:", house.nextWeek, "");
  }

  if (house.stages.length > 0) {
    lines.push(`Underway: ${house.stages.map((s) => s.name).join(", ")}.`);
  }

  if (house.waitingOn) {
    const eta = house.waitingOnEta
      ? `, expected ${house.waitingOnEta.toLocaleDateString("en-AU", { weekday: "long", day: "numeric", month: "long" })}`
      : "";
    lines.push(`We are waiting on ${house.waitingOn}${eta}.`);
  }

  // Last thing before the sign-off, because it is the only line that asks them
  // to do something — and an unapproved variation is work that cannot start.
  if (house.variations.length > 0) {
    lines.push(
      "",
      house.variations.length === 1
        ? `Variation ${house.variations[0].reference} is still waiting on your approval. Nothing is charged, and that work does not start, until you decide.`
        : `${house.variations.length} variations are still waiting on your approval. Nothing is charged, and that work does not start, until you decide.`
    );
  }

  lines.push("", "If anything here raises a question, reply on your build page and I will get back to you.");
  return lines.join("\n");
}

/** Year and week number, e.g. 2026-W38. Stable enough to dedupe a weekly job. */
function isoWeek(d: Date): string {
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  date.setUTCDate(date.getUTCDate() + 4 - (date.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((date.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

/**
 * Both verbs. Vercel Cron issues GET; Supabase pg_net is usually POST. Exposing
 * only one of them fails silently forever — the queue simply never drains and
 * nothing anywhere says so.
 */
export const GET = run;
export const POST = run;

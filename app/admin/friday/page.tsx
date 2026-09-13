import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/auth-guard";
import FridayPrep from "@/components/admin/FridayPrep";

export const dynamic = "force-dynamic";

/**
 * Thursday afternoon: write next week, once, for every house.
 *
 * The Friday email goes out on its own whether or not he touches this — that
 * safety net is the point. But an email that only recaps the week just gone
 * tells owners what they could already see in the photos. What is coming is the
 * part they cannot know, and the part they ring to ask about.
 *
 * One screen, every house, a microphone on his own keyboard. Ten minutes for
 * the portfolio.
 */
export default async function FridayPrepPage() {
  await requireStaff();

  const since = new Date(Date.now() - 7 * 86_400_000);

  const houses = await prisma.house.findMany({
    where: { status: { in: ["active", "practical_completion"] } },
    select: {
      id: true,
      address: true,
      suburb: true,
      waitingOn: true,
      nextWeek: true,
      nextWeekSetAt: true,
      stages: {
        where: { status: "in_progress" },
        select: { name: true },
        orderBy: { position: "asc" },
      },
      updates: {
        where: { publishedAt: { not: null }, occurredAt: { gte: since }, deletedAt: null },
        select: { id: true, body: true, occurredAt: true },
        orderBy: { occurredAt: "asc" },
      },
      owners: { where: { revokedAt: null }, select: { owner: { select: { email: true } } } },
    },
    orderBy: { address: "asc" },
  });

  const fresh = (at: Date | null) =>
    Boolean(at && Date.now() - at.getTime() < 10 * 86_400_000);

  const rows = houses.map((h) => ({
    id: h.id,
    address: h.address,
    suburb: h.suburb,
    waitingOn: h.waitingOn,
    underway: h.stages.map((s) => s.name),
    thisWeek: h.updates.map((u) => ({
      id: u.id,
      body: u.body,
      day: u.occurredAt.toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short" }),
    })),
    nextWeek: fresh(h.nextWeekSetAt) ? h.nextWeek : null,
    recipients: h.owners.filter((o) => o.owner.email).length,
  }));

  const done = rows.filter((r) => r.nextWeek).length;

  return (
    <div className="mx-auto max-w-2xl">
      <header className="mb-7">
        <h1 className="font-display text-3xl text-white">Friday email</h1>
        <p className="mt-1 text-white/50">
          {done} of {rows.length} houses have next week written.
        </p>
        <p className="mt-3 max-w-prose text-sm leading-relaxed text-white/45">
          The email goes out Friday morning either way. Adding a line about what&apos;s coming is
          what stops them ringing to ask. Tap the box and use the microphone on your keyboard —
          just say it out loud.
        </p>
      </header>

      <FridayPrep houses={rows} />
    </div>
  );
}

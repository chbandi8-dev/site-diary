import { prisma } from "@/lib/prisma";

export * from "./today-tasks";

/**
 * What needs him today — one definition, read by two things.
 *
 * The dashboard shows it and the evening message lists it. They could disagree:
 * "26 things" on the screen and "5" in his inbox, neither wrong, because each
 * had worked it out for itself. One place decides what counts as wanting him,
 * so the number he is told is the number he finds.
 *
 * Everything here is either something he must do or something an owner is
 * waiting on. Counts that imply no action have no place in it.
 */

export async function loadToday() {
  const now = Date.now();
  const weekAgo = new Date(now - 7 * 86_400_000);
  // Ten days, not seven: a Friday glance should still catch the start of the
  // week after, which is when a booking would have to be made.
  const horizon = new Date(now + 10 * 86_400_000);

  const [houses, dueSoon] = await Promise.all([
    prisma.house.findMany({
      relationLoadStrategy: "join",
      where: { status: { not: "handed_over" } },
      select: {
        id: true,
        address: true,
        suburb: true,
        lotNumber: true,
        waitingOn: true,
        nextWeek: true,
        nextWeekSetAt: true,
        startDate: true,
        targetHandover: true,
        handoverTo: true,
        development: { select: { id: true, name: true } },
        // Every stage, not just what's underway: the phase rollup and the slip
        // both need the whole spine, and one pass over it answers both.
        stages: {
          select: {
            id: true,
            name: true,
            phase: true,
            position: true,
            status: true,
            dueBy: true,
            plannedDays: true,
            startedAt: true,
            completedAt: true,
            estimatedEnd: true,
          },
          orderBy: { position: "asc" },
        },
        updates: {
          where: { publishedAt: { not: null }, deletedAt: null },
          select: { occurredAt: true },
          orderBy: { occurredAt: "desc" },
          take: 1,
        },
        decisions: {
          where: { status: "open" },
          select: { id: true, question: true, dueDate: true },
        },
        variations: {
          where: { status: "sent" },
          select: { id: true, reference: true, amountCents: true },
        },
        ownerReports: {
          where: { status: { in: ["submitted", "acknowledged"] } },
          select: { id: true, body: true, createdAt: true, owner: { select: { name: true } } },
        },
        weatherDays: {
          where: { workLost: true, date: { gte: weekAgo } },
          select: { id: true },
        },
        owners: {
          where: { revokedAt: null },
          select: { lastSeenAt: true, owner: { select: { name: true, email: true } } },
        },
        _count: {
          select: {
            updates: { where: { publishedAt: null, deletedAt: null } },
            owners: { where: { revokedAt: null } },
            weatherDays: { where: { workLost: true } },
          },
        },
      },
      orderBy: { address: "asc" },
    }),
    // What the programme says is due shortly, read from the stored due dates
    // rather than recomputed: twenty-five forecasts on a dashboard render is
    // not a dashboard. One query across every house, not one per house.
    prisma.houseStage.findMany({
      relationLoadStrategy: "join",
      where: {
        dueBy: { not: null, lte: horizon },
        status: { notIn: ["complete", "not_applicable"] },
        house: { status: { not: "handed_over" } },
      },
      select: {
        id: true,
        name: true,
        dueBy: true,
        houseId: true,
        house: { select: { address: true, lotNumber: true } },
      },
      orderBy: { dueBy: "asc" },
      take: 40,
    }),
  ]);

  return { houses, dueSoon };
}

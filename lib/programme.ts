import { prisma } from "@/lib/prisma";
import { forecast, backwardPlan, type ForecastStage } from "@/lib/forecast";

/**
 * Keeping each house's due dates true without anyone asking.
 *
 * The saved due dates are what the dashboard's "behind their dates" count, the
 * run sheet's filter and the builder's board all read — and until now they were
 * only ever written when he opened a house, entered a promised date and pressed
 * the forecast button. A house that had never been through that could not show
 * as late, however late it was. So the one date he gives (the handover he has
 * promised) now builds the programme itself, and every change to a build —
 * a stage ticked, a stage added, a house created — refreshes it.
 *
 * What this deliberately does NOT do, because the forecast route was written
 * around the rule and it is the right one: it never moves the handover window
 * an owner sees, never writes the stage-estimate history, and never emails
 * anybody. A date that moves on its own, with no human deciding it had really
 * moved, is how an owner finds out their handover slipped from a robot. This
 * only refreshes his own private due dates, which nobody but him reads.
 */

export async function loadProgramme(houseId: string, overrideTarget?: Date) {
  const house = await prisma.house.findUnique({
    where: { id: houseId },
    select: {
      id: true,
      address: true,
      startDate: true,
      targetHandover: true,
      handoverFrom: true,
      handoverTo: true,
      stages: {
        select: {
          id: true,
          name: true,
          phase: true,
          position: true,
          status: true,
          plannedDays: true,
          startedAt: true,
          completedAt: true,
          estimatedEnd: true,
          dueBy: true,
        },
        orderBy: { position: "asc" },
      },
      _count: { select: { weatherDays: { where: { workLost: true } } } },
    },
  });
  if (!house) return null;

  const target = overrideTarget ?? house.targetHandover ?? null;

  const result = forecast({
    startDate: house.startDate,
    stages: house.stages as ForecastStage[],
    wetDaysLost: house._count.weatherDays,
  });

  // Only when a date has actually been committed to. Inventing a target so the
  // screen has something to show would produce a slip figure measured against
  // nothing, which is worse than no figure.
  const plan = target
    ? backwardPlan({
        target,
        stages: house.stages as ForecastStage[],
        forecast: result.stages,
        wetDaysLost: house._count.weatherDays,
        workingDaysElapsed: 0,
      })
    : null;

  return { house, result, plan };
}

/**
 * Recomputes this house's due dates from its promised handover.
 *
 * With `target` it also records that date as the promise. Without a date there
 * is nothing to work back from, and it does nothing — it never invents one.
 * Writes only the rows that changed, so a tick that moves nothing costs nothing.
 */
export async function refreshDueDates(
  houseId: string,
  opts?: { target?: Date | null }
): Promise<{ target: Date | null; updated: number }> {
  const loaded = await loadProgramme(houseId, opts?.target ?? undefined);
  if (!loaded) return { target: null, updated: 0 };

  const target = opts?.target ?? loaded.house.targetHandover ?? null;
  if (!target || !loaded.plan) return { target: null, updated: 0 };

  const have = new Map(loaded.house.stages.map((s) => [s.id, s.dueBy?.getTime() ?? null]));
  const changes = loaded.plan.targets.filter((t) => have.get(t.id) !== t.dueBy.getTime());
  const promiseChanged = loaded.house.targetHandover?.getTime() !== target.getTime();

  await prisma.$transaction([
    ...(opts?.target && promiseChanged
      ? [prisma.house.update({ where: { id: houseId }, data: { targetHandover: target } })]
      : []),
    ...changes.map((t) =>
      prisma.houseStage.update({ where: { id: t.id }, data: { dueBy: t.dueBy } })
    ),
  ]);

  return { target, updated: changes.length };
}

/** Never lets a programme failure fail the thing he actually did. */
export async function refreshQuietly(houseId: string, opts?: { target?: Date | null }) {
  try {
    await refreshDueDates(houseId, opts);
  } catch (cause) {
    console.error("programme refresh failed for", houseId, cause);
  }
}

/**
 * Catches up houses that were given a handover before any of this existed.
 *
 * Every house already on the books with a promised date, or an owner-facing
 * window, and no saved due dates would otherwise stay invisible to the
 * "behind" count until he opened each one. Called when the dashboard loads, a
 * few at a time, and does nothing once everything is caught up.
 *
 * A window with no separate promise is read as the promise at its far end: a
 * man who has told an owner "March to April" has committed to the end of April.
 */
export async function backfillProgrammes(limit = 8): Promise<number> {
  const houses = await prisma.house.findMany({
    where: {
      status: { not: "handed_over" },
      OR: [{ targetHandover: { not: null } }, { handoverTo: { not: null } }],
      stages: {
        some: { status: { notIn: ["complete", "not_applicable"] } },
        none: { dueBy: { not: null } },
      },
    },
    select: { id: true, targetHandover: true, handoverTo: true },
    take: limit,
  });

  for (const h of houses) {
    await refreshQuietly(h.id, h.targetHandover ? undefined : { target: h.handoverTo });
  }
  return houses.length;
}

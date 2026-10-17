import type { loadToday } from "./today";
import { computeExpected } from "./expected";
import type { ForecastStage } from "./forecast";

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

export const DAYS_QUIET_BEFORE_FLAG = 5;

export type TaskKind = "report" | "decision" | "draft" | "unseen" | "quiet" | "due";

export type Task = {
  houseId: string;
  address: string;
  /** 1 is most pressing. 1-2 is "today", 3-4 "this week", 5+ "coming up". */
  urgency: number;
  label: string;
  detail: string;
  kind: TaskKind;
  /** For a stage coming up: whole days until it is due. Negative once late. */
  days?: number;
  /** Where the house will really land, for him only: "Promised 31 Dec · expected 14–28 Feb · about 9 weeks late". */
  expected?: string;
};

type Today = Awaited<ReturnType<typeof loadToday>>;

export function buildTasks(
  houses: Today["houses"],
  dueSoon: Today["dueSoon"],
  now = Date.now()
): Task[] {
  // ── Everything that wants him ───────────────────────────────────────────
  // Built per house, then flattened and sorted, so the list reads as a to-do
  // rather than a directory he has to scan.
  const tasks: Task[] = [];

  for (const h of houses) {
    for (const r of h.ownerReports) {
      tasks.push({
        houseId: h.id,
        address: h.address,
        urgency: 1,
        label: `${r.owner.name} is waiting on an answer`,
        detail: r.body.length > 90 ? `${r.body.slice(0, 90)}…` : r.body,
        kind: "report",
      });
    }

    for (const d of h.decisions) {
      const overdue = d.dueDate && d.dueDate.getTime() < now;
      if (!overdue) continue;
      tasks.push({
        houseId: h.id,
        address: h.address,
        urgency: 2,
        label: "A decision is overdue",
        detail: `${d.question} — chase them`,
        kind: "decision",
      });
    }

    if (h._count.updates > 0) {
      tasks.push({
        houseId: h.id,
        address: h.address,
        urgency: 3,
        label: `${h._count.updates} update${h._count.updates === 1 ? "" : "s"} never sent`,
        detail: "Written but still sitting as a draft",
        kind: "draft",
      });
    }

    // Somebody he has been writing to who has stopped reading. Ranked below
    // his own overdue work: it is a nudge, not a job, and an owner who is not
    // looking is a phone call he can get ahead of rather than one he has caused.
    for (const link of h.owners) {
      if (!link.owner.email) continue;
      const days = link.lastSeenAt
        ? Math.floor((now - link.lastSeenAt.getTime()) / 86_400_000)
        : null;
      if (days !== null && days < 21) continue;
      tasks.push({
        houseId: h.id,
        address: h.address,
        urgency: 5,
        label:
          days === null
            ? `${link.owner.name} has never opened their page`
            : `${link.owner.name} hasn't looked in ${Math.floor(days / 7)} weeks`,
        detail: "Worth a call — they may not know what's happening",
        kind: "unseen",
      });
    }

    const last = h.updates[0]?.occurredAt;
    const daysQuiet = last ? Math.floor((now - last.getTime()) / 86_400_000) : null;
    if (daysQuiet === null || daysQuiet >= DAYS_QUIET_BEFORE_FLAG) {
      tasks.push({
        houseId: h.id,
        address: h.address,
        urgency: 4,
        label: daysQuiet === null ? "Never updated" : `Quiet for ${daysQuiet} days`,
        detail:
          h._count.owners > 0
            ? "The owners have heard nothing"
            : "No owners registered on this house yet",
        kind: "quiet",
      });
    }
  }

  // The programme's own to-do list. Derived rather than kept by hand: a manual
  // list is one more thing to feed and goes stale in a fortnight like every
  // other one. These cannot, because they come from dates already held.
  //
  // ONE line per house for what is behind. When a promise cannot be kept, every
  // remaining stage is past its date at once, and a line for each turns one
  // house into fifteen and buries the rest of his list. The most overdue stage
  // is where the slip starts; the rest are said in a count.
  const lateAt = new Map<string, number>(); // house -> index of its line
  const lateMore = new Map<string, number>(); // house -> how many more stages
  for (const stage of dueSoon) {
    if (!stage.dueBy) continue;
    const days = Math.round((stage.dueBy.getTime() - now) / 86_400_000);

    if (days < 0 && lateAt.has(stage.houseId)) {
      lateMore.set(stage.houseId, (lateMore.get(stage.houseId) ?? 0) + 1);
      continue;
    }
    if (days < 0) lateAt.set(stage.houseId, tasks.length);

    tasks.push({
      houseId: stage.houseId,
      address: stage.house.lotNumber ? `Lot ${stage.house.lotNumber}` : stage.house.address,
      // Past its promised date ranks with his own overdue work. Merely coming
      // up sits below it — that is a heads-up, not a job.
      urgency: days < 0 ? 2 : 6,
      label:
        days < 0
          ? `${stage.name} is ${Math.abs(days)} days past due`
          : days === 0
            ? `${stage.name} is due today`
            : `${stage.name} due in ${days} day${days === 1 ? "" : "s"}`,
      detail:
        days < 0
          ? "Behind the date you promised — this is where the slip is"
          : "To hold the handover date you've given them",
      kind: "due",
      days,
    });
  }
  const byId = new Map(houses.map((h) => [h.id, h]));
  lateMore.forEach((more, houseId) => {
    const task = tasks[lateAt.get(houseId)!];
    task.detail = `Behind the date you promised — and ${more} later stage${more === 1 ? "" : "s"} behind it too`;
  });
  // Where it will really land, for him alone. Said only on a house that is
  // already behind: a house on time needs no second date quoted at him.
  lateAt.forEach((index, houseId) => {
    const h = byId.get(houseId);
    if (!h) return;
    const e = computeExpected({
      startDate: h.startDate,
      promised: h.targetHandover ?? h.handoverTo,
      wetDaysLost: h._count.weatherDays,
      stages: h.stages as unknown as ForecastStage[],
      today: new Date(now),
    });
    if (e && e.state !== "on_track") {
      tasks[index].expected = e.summary;
      tasks[index].detail += `. ${e.summary}`;
    }
  });

  tasks.sort((a, b) => a.urgency - b.urgency || a.address.localeCompare(b.address));

  return tasks;
}

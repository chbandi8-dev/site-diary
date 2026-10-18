import { forecastInternals, type ForecastStage } from "./forecast";

/**
 * How long his stages really take, as opposed to how long the standard list
 * says they do.
 *
 * The forecast runs on `plannedDays` copied from the standard stages, which are
 * the industry's typical figures. His own crews are quicker at some stages and
 * slower at others, and every stage he ticks done is a measurement of that for
 * free. After a few houses the expected window can run on his pace instead.
 *
 * A stage's duration is the working days from when it started to when it was
 * finished. Plenty of stages are ticked straight to done with no "underway"
 * step, so where there is no start the previous finished stage's completion
 * stands in for it — a build is mostly one thing after another.
 *
 * What is deliberately NOT learned from:
 *   - anything that took under a working day. A house entered mid-build has its
 *     earlier stages ticked off in one sitting, and those zeros say nothing
 *     about how long the work took.
 *   - anything absurd (over 200 working days): a stage forgotten and ticked
 *     months later.
 *
 * And a stage needs three examples before it overrides the standard figure,
 * pulled no further than a third or three times the standard — one slow house
 * must not rewrite the whole programme.
 */

export type PaceRow = {
  houseId: string;
  name: string;
  position: number;
  plannedDays: number | null;
  startedAt: Date | null;
  completedAt: Date | null;
};

export type Pace = Map<string, { days: number; samples: number }>;

export const MIN_SAMPLES = 3;

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
};

export function learnPace(rows: PaceRow[]): Pace {
  const byHouse = new Map<string, PaceRow[]>();
  for (const r of rows) {
    const list = byHouse.get(r.houseId) ?? [];
    list.push(r);
    byHouse.set(r.houseId, list);
  }

  const durations = new Map<string, number[]>();
  const standard = new Map<string, number[]>();

  byHouse.forEach((stages) => {
    stages.sort((a, b) => a.position - b.position);
    let previousDone: Date | null = null;
    for (const s of stages) {
      if (!s.completedAt) continue;
      const start = s.startedAt ?? previousDone;
      previousDone = s.completedAt;
      if (s.plannedDays) {
        const list = standard.get(s.name) ?? [];
        list.push(s.plannedDays);
        standard.set(s.name, list);
      }
      if (!start || start >= s.completedAt) continue;
      const days = forecastInternals.workingDaysBetween(start, s.completedAt);
      if (days < 1 || days > 200) continue;
      const list = durations.get(s.name) ?? [];
      list.push(days);
      durations.set(s.name, list);
    }
  });

  const pace: Pace = new Map();
  durations.forEach((list, name) => {
    if (list.length < MIN_SAMPLES) return;
    const std = standard.has(name) ? median(standard.get(name)!) : null;
    let days = Math.round(median(list));
    if (std) days = Math.min(Math.max(days, Math.max(1, Math.round(std / 3))), Math.round(std * 3));
    pace.set(name, { days: Math.max(1, days), samples: list.length });
  });
  return pace;
}

/** The stages still to do, run at his pace where there is enough to go on. */
export function applyPace(
  stages: ForecastStage[],
  pace: Pace | undefined
): { stages: ForecastStage[]; paced: number } {
  if (!pace || pace.size === 0) return { stages, paced: 0 };
  let paced = 0;
  const out = stages.map((s) => {
    const learned = pace.get(s.name);
    if (!learned || s.status === "complete" || s.status === "not_applicable") return s;
    if (learned.days === s.plannedDays) return s;
    paced++;
    return { ...s, plannedDays: learned.days };
  });
  return { stages: out, paced };
}

/**
 * Critical-stage inspections, in the words he uses.
 *
 * These are the gates that legally stop work until they pass. They are booked a
 * day or two ahead, and they fail — and a failed one that nobody rebooks is a
 * crew standing around. Kept apart from stages because a stage ticked done does
 * not mean the certifier agreed.
 */

export const INSPECTION_KINDS = [
  { kind: "pre_pour_footings", label: "Footings / pre-pour" },
  { kind: "frame", label: "Frame" },
  { kind: "waterproofing", label: "Waterproofing" },
  { kind: "stormwater", label: "Stormwater" },
  { kind: "vehicle_crossing", label: "Driveway crossing" },
  { kind: "final_occupation", label: "Final / occupation certificate" },
  { kind: "other", label: "Something else…" },
] as const;

export type InspectionKindKey = (typeof INSPECTION_KINDS)[number]["kind"];

export const INSPECTION_STATUS = ["to_book", "booked", "passed", "failed"] as const;
export type InspectionStatusKey = (typeof INSPECTION_STATUS)[number];

const BY_KIND = new Map<string, string>(INSPECTION_KINDS.map((k) => [k.kind, k.label]));

/** "Frame inspection", or his own words for the ones with a label. */
export function inspectionName(kind: string, label: string | null | undefined): string {
  const named = label?.trim();
  if (named) return /inspection/i.test(named) ? named : `${named} inspection`;
  const base = BY_KIND.get(kind) ?? "Inspection";
  return kind === "other" || /inspection|certificate/i.test(base) ? base : `${base} inspection`;
}

const DAY = 86_400_000;

/** Whole days from today to a booked date; negative once it has gone by. */
export function daysUntil(date: Date, now: number): number {
  const startOfToday = Math.floor(now / DAY) * DAY;
  const target = Math.floor(date.getTime() / DAY) * DAY;
  return Math.round((target - startOfToday) / DAY);
}

export function whenText(days: number): string {
  if (days === 0) return "today";
  if (days === 1) return "tomorrow";
  if (days === -1) return "yesterday";
  return days > 0 ? `in ${days} days` : `${-days} days ago`;
}

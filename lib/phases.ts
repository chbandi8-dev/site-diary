/**
 * Where a build has got to, expressed as the phase an owner would name.
 *
 * The stage list is deliberately granular — thirty-one steps, several of which
 * run at the same time — because he needs that detail for claims and evidence.
 * Nobody can read a portfolio at that resolution. The `phase` column rolls the
 * spine up into nine named groups, and this is the one place that rollup is
 * computed, so the dashboard, the house list and the owner's rail can never
 * disagree about which phase a house is in.
 *
 * Deliberately not a percentage. Lock-up is about half the stages and about a
 * third of the time, so any number derived from stage count is a promise he
 * would spend the rest of the build walking back.
 */

export type StageFacts = {
  phase: string | null;
  status: string;
  position: number;
  dueBy: Date | null;
};

export const UNPHASED = "In progress";

/**
 * The phases in build order, derived from where their stages sit in the spine
 * rather than from a hardcoded list — he can add and remove stages, and a
 * phase that no longer has any stages should stop appearing on its own.
 */
export function phaseOrder(stages: StageFacts[]): string[] {
  const firstPosition = new Map<string, number>();
  for (const s of stages) {
    const phase = s.phase ?? UNPHASED;
    const seen = firstPosition.get(phase);
    if (seen === undefined || s.position < seen) firstPosition.set(phase, s.position);
  }
  return Array.from(firstPosition.entries())
    .sort((a, b) => a[1] - b[1])
    .map(([name]) => name);
}

/**
 * The phase the work is actually in.
 *
 * Reads from the frontier — the furthest stage anyone has touched — rather than
 * from the first unticked box. Nobody ever goes back and ticks "Selections &
 * colours" once the frame is up, and a board that called that house "Before we
 * start" would be wrong in the way that loses his trust in the whole screen.
 */
export function currentPhase(stages: StageFacts[]): string | null {
  const live = stages.filter((s) => s.status !== "not_applicable");
  if (live.length === 0) return null;

  const underway = live.filter((s) => s.status === "in_progress");
  if (underway.length > 0) {
    // The furthest thing underway, not the earliest: brickwork while the roof
    // is tiled should read as the later of the two.
    const furthest = underway.reduce((a, b) => (b.position > a.position ? b : a));
    return furthest.phase ?? UNPHASED;
  }

  const done = live.filter((s) => s.status === "complete");
  if (done.length === 0) return live.reduce((a, b) => (b.position < a.position ? b : a)).phase ?? UNPHASED;

  const frontier = done.reduce((a, b) => (b.position > a.position ? b : a));
  const next = live
    .filter((s) => s.position > frontier.position)
    .sort((a, b) => a.position - b.position)[0];

  return (next ?? frontier).phase ?? UNPHASED;
}

/** Stages past the date they had to finish on to hold the handover he promised. */
export function overdueStages(stages: StageFacts[], now = Date.now()): StageFacts[] {
  return stages.filter(
    (s) =>
      s.dueBy !== null &&
      s.dueBy.getTime() < now &&
      s.status !== "complete" &&
      s.status !== "not_applicable"
  );
}

/** Whether a programme has been worked out for this house at all. */
export function hasProgramme(stages: StageFacts[]): boolean {
  return stages.some((s) => s.dueBy !== null);
}

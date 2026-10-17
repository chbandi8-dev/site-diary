import { test } from "node:test";
import assert from "node:assert/strict";
import { currentPhase, overdueStages, phaseOrder, type StageFacts } from "../lib/phases";

const stage = (position: number, phase: string, status: string, dueBy: Date | null = null): StageFacts => ({
  phase,
  status,
  position,
  dueBy,
});

const SPINE = (statuses: string[]): StageFacts[] =>
  statuses.map((s, i) => stage(i + 1, ["Before", "Frame", "Fit-out"][Math.floor(i / 2)], s));

test("the phase is where the work is, not the first unticked box", () => {
  // Nobody back-fills the early admin stages, so they stay unticked.
  const stages = SPINE(["not_started", "complete", "in_progress", "not_started", "not_started", "not_started"]);
  assert.equal(currentPhase(stages), "Frame");
});

test("of several stages underway, the furthest one names the phase", () => {
  const stages = SPINE(["complete", "complete", "in_progress", "not_started", "in_progress", "not_started"]);
  assert.equal(currentPhase(stages), "Fit-out");
});

test("with nothing underway it points at what comes next, not nothing", () => {
  const stages = SPINE(["complete", "complete", "complete", "not_started", "not_started", "not_started"]);
  assert.equal(currentPhase(stages), "Frame");
});

test("a finished build has no current phase to point at beyond the last", () => {
  const stages = SPINE(["complete", "complete", "complete", "complete", "complete", "complete"]);
  assert.equal(currentPhase(stages), "Fit-out");
});

test("phases come out in build order", () => {
  const stages = SPINE(["complete", "complete", "in_progress", "not_started", "not_started", "not_started"]);
  assert.deepEqual(phaseOrder(stages), ["Before", "Frame", "Fit-out"]);
});

test("only unfinished stages past their date count as late", () => {
  const past = new Date(Date.now() - 5 * 86_400_000);
  const stages = [
    stage(1, "A", "complete", past),
    stage(2, "A", "not_applicable", past),
    stage(3, "A", "in_progress", past),
    stage(4, "A", "not_started", new Date(Date.now() + 86_400_000)),
  ];
  assert.equal(overdueStages(stages).length, 1);
});

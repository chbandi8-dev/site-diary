import { test } from "node:test";
import assert from "node:assert/strict";
import { learnPace, applyPace, type PaceRow } from "../lib/pace";
import { computeExpected } from "../lib/expected";
import type { ForecastStage } from "../lib/forecast";

const d = (m: number, day: number) => new Date(Date.UTC(2026, m, day));

// A house where the frame took exactly `weeks` working weeks, started and finished by hand.
const house = (id: string, weeks: number, name = "Frame"): PaceRow => ({
  houseId: id,
  name,
  position: 1,
  plannedDays: 12,
  startedAt: d(2, 2), // Mon 2 Mar 2026
  completedAt: d(2, 2 + weeks * 7),
});

test("a stage needs three examples before it overrides the standard", () => {
  assert.equal(learnPace([house("a", 1), house("b", 1)]).size, 0);
  const pace = learnPace([house("a", 1), house("b", 1), house("c", 1)]);
  assert.equal(pace.get("Frame")!.days, 5);
  assert.equal(pace.get("Frame")!.samples, 3);
});

test("the median is used, so one slow house does not rewrite the programme", () => {
  const pace = learnPace([house("a", 2), house("b", 2), house("c", 2), house("d", 9)]);
  assert.equal(pace.get("Frame")!.days, 10);
});

test("a stage ticked the same day it was started teaches nothing", () => {
  const same = (id: string): PaceRow => ({ ...house(id, 1), completedAt: d(2, 2) });
  assert.equal(learnPace([same("a"), same("b"), same("c")]).size, 0);
});

test("with no start, the previous stage finishing stands in for it", () => {
  const two = (id: string): PaceRow[] => [
    { houseId: id, name: "Slab", position: 1, plannedDays: 10, startedAt: null, completedAt: d(2, 2) },
    { houseId: id, name: "Frame", position: 2, plannedDays: 12, startedAt: null, completedAt: d(2, 16) },
  ];
  const pace = learnPace([...two("a"), ...two("b"), ...two("c")]);
  assert.equal(pace.get("Frame")!.days, 10);
  assert.equal(pace.has("Slab"), false); // nothing before it to measure from
});

test("it is pulled no further than three times the standard", () => {
  const pace = learnPace([house("a", 20), house("b", 20), house("c", 20)]);
  assert.equal(pace.get("Frame")!.days, 36);
});

test("applyPace changes only the stages still to do, and says how many", () => {
  const stages: ForecastStage[] = [
    { id: "1", name: "Frame", phase: "x", position: 1, status: "complete", plannedDays: 12, startedAt: null, completedAt: d(2, 1), estimatedEnd: null },
    { id: "2", name: "Frame", phase: "x", position: 2, status: "not_started", plannedDays: 12, startedAt: null, completedAt: null, estimatedEnd: null },
  ];
  const { stages: out, paced } = applyPace(stages, new Map([["Frame", { days: 5, samples: 3 }]]));
  assert.equal(paced, 1);
  assert.equal(out[0].plannedDays, 12);
  assert.equal(out[1].plannedDays, 5);
});

test("a faster pace pulls the expected window in", () => {
  const stages: ForecastStage[] = [
    { id: "1", name: "Frame", phase: "x", position: 1, status: "not_started", plannedDays: 40, startedAt: null, completedAt: null, estimatedEnd: null },
    { id: "2", name: "Handover & keys", phase: "Handover", position: 2, status: "not_started", plannedDays: 1, startedAt: null, completedAt: null, estimatedEnd: null },
  ];
  const today = d(9, 19);
  const base = computeExpected({ startDate: null, promised: null, wetDaysLost: 0, stages, today })!;
  const quick = computeExpected({ startDate: null, promised: null, wetDaysLost: 0, stages, today, pace: new Map([["Frame", { days: 15, samples: 4 }]]) })!;
  assert.ok(quick.to.getTime() < base.to.getTime());
  assert.equal(quick.pacedStages, 1);
  assert.equal(base.pacedStages, 0);
});

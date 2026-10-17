import { test } from "node:test";
import assert from "node:assert/strict";
import { computeExpected, windowText } from "../lib/expected";
import type { ForecastStage } from "../lib/forecast";

const TODAY = new Date(Date.UTC(2026, 9, 19)); // Monday 19 Oct 2026

// Shaped like the real spine: stages before handover, then the warranty after it.
const spine = (statuses: string[], plannedDays = 10): ForecastStage[] => [
  ...statuses.map((status, i) => ({
    id: `s${i}`,
    name: `Stage ${i}`,
    phase: "Build",
    position: i + 1,
    status,
    plannedDays,
    startedAt: status === "in_progress" ? new Date(Date.UTC(2026, 9, 5)) : null,
    completedAt: status === "complete" ? new Date(Date.UTC(2026, 8, 1)) : null,
    estimatedEnd: null,
  })),
  {
    id: "warranty", name: "Defects liability period", phase: "After handover",
    position: 99, status: "not_started", plannedDays: 90, startedAt: null, completedAt: null, estimatedEnd: null,
  },
];

const ten = (n: number) => Array.from({ length: n }, () => "not_started");
const at = (y: number, m: number, d: number) => new Date(Date.UTC(y, m, d));

test("a promise that cannot be kept is LATE, by how much, in weeks", () => {
  const e = computeExpected({ startDate: null, promised: at(2026, 11, 31), wetDaysLost: 0, stages: spine(ten(12)), today: TODAY })!;
  assert.equal(e.state, "late");
  assert.ok(e.lateDays! > 60, `expected a long slip, got ${e.lateDays}`);
  assert.match(e.verdict!, /about \d+ weeks late/);
  assert.match(e.summary, /^Promised 31 Dec · expected .* · about \d+ weeks late$/);
});

test("a distant promise is on track", () => {
  const e = computeExpected({ startDate: null, promised: at(2028, 5, 30), wetDaysLost: 0, stages: spine(ten(5)), today: TODAY })!;
  assert.equal(e.state, "on_track");
  assert.equal(e.verdict, "on track");
});

test("a promise that lands inside the window is tight, not late", () => {
  const base = computeExpected({ startDate: null, promised: null, wetDaysLost: 0, stages: spine(ten(6)), today: TODAY })!;
  const middle = new Date((base.from.getTime() + base.to.getTime()) / 2);
  const e = computeExpected({ startDate: null, promised: middle, wetDaysLost: 0, stages: spine(ten(6)), today: TODAY })!;
  assert.equal(e.state, "tight");
});

test("the warranty period is not counted as time before handover", () => {
  const withIt = computeExpected({ startDate: null, promised: null, wetDaysLost: 0, stages: spine(ten(4)), today: TODAY })!;
  const without = computeExpected({ startDate: null, promised: null, wetDaysLost: 0, stages: spine(ten(4)).slice(0, 4), today: TODAY })!;
  assert.equal(withIt.from.getTime(), without.from.getTime());
});

test("the Christmas shutdown makes a December finish later than the same work in March", () => {
  const stages = spine(ten(3), 8);
  const december = computeExpected({ startDate: null, promised: null, wetDaysLost: 0, stages, today: at(2026, 11, 1) })!;
  const march = computeExpected({ startDate: null, promised: null, wetDaysLost: 0, stages, today: at(2027, 2, 1) })!;
  const spanDec = (december.from.getTime() - at(2026, 11, 1).getTime()) / 86_400_000;
  const spanMar = (march.from.getTime() - at(2027, 2, 1).getTime()) / 86_400_000;
  assert.ok(spanDec > spanMar + 10, `December ${spanDec}d vs March ${spanMar}d`);
});

test("days already lost to rain push the expected finish out", () => {
  const dry = computeExpected({ startDate: new Date(Date.UTC(2026, 3, 1)), promised: null, wetDaysLost: 0, stages: spine(ten(8)), today: TODAY })!;
  const wet = computeExpected({ startDate: new Date(Date.UTC(2026, 3, 1)), promised: null, wetDaysLost: 20, stages: spine(ten(8)), today: TODAY })!;
  assert.ok(wet.from.getTime() >= dry.from.getTime());
});

test("no promise still gives an expected window", () => {
  const e = computeExpected({ startDate: null, promised: null, wetDaysLost: 0, stages: spine(ten(4)), today: TODAY })!;
  assert.equal(e.state, "no_promise");
  assert.match(e.summary, /^Expected /);
});

test("a finished build has nothing left to forecast", () => {
  const done = spine(Array.from({ length: 4 }, () => "complete"));
  assert.equal(computeExpected({ startDate: null, promised: at(2027, 1, 1), wetDaysLost: 0, stages: done, today: TODAY }), null);
});

test("the window is written as a window, with the year only when it is not this one", () => {
  assert.equal(windowText(at(2026, 10, 14), at(2026, 10, 28), TODAY), "14–28 Nov");
  assert.equal(windowText(at(2026, 10, 28), at(2026, 11, 12), TODAY), "28 Nov – 12 Dec");
  assert.equal(windowText(at(2027, 1, 14), at(2027, 1, 28), TODAY), "14–28 Feb 2027");
});

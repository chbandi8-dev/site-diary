import { test } from "node:test";
import assert from "node:assert/strict";
import { backwardPlan, forecast, type ForecastStage } from "../lib/forecast";

const day = 86_400_000;
const stages = (n: number): ForecastStage[] =>
  Array.from({ length: n }, (_, i) => ({
    id: `s${i}`,
    name: `Stage ${i}`,
    position: i + 1,
    status: "not_started",
    plannedDays: 10,
    startedAt: null,
    completedAt: null,
    estimatedEnd: null,
  }));

test("a promise far enough away leaves spare days", () => {
  const plan = backwardPlan({ target: new Date(Date.now() + 400 * day), stages: stages(5) });
  assert.ok(plan.floatDays > 0, `expected spare days, got ${plan.floatDays}`);
});

test("a promise that cannot be kept shows as behind, not as zero", () => {
  const plan = backwardPlan({ target: new Date(Date.now() + 10 * day), stages: stages(5) });
  assert.ok(plan.floatDays < 0, `expected a shortfall, got ${plan.floatDays}`);
});

test("every unfinished stage gets a date it has to finish by, in order", () => {
  const plan = backwardPlan({ target: new Date(Date.now() + 300 * day), stages: stages(4) });
  assert.equal(plan.targets.length, 4);
  const times = plan.targets.map((t) => t.dueBy.getTime());
  assert.deepEqual([...times].sort((a, b) => a - b), times);
});

test("finished stages are not given a due date", () => {
  const list = stages(3);
  list[0].status = "complete";
  const plan = backwardPlan({ target: new Date(Date.now() + 300 * day), stages: list });
  assert.equal(plan.targets.length, 2);
});

test("a build that is entirely finished forecasts nothing to do", () => {
  const list = stages(2).map((s) => ({ ...s, status: "complete" }));
  const result = forecast({ startDate: null, stages: list, wetDaysLost: 0 });
  assert.equal(result.stages.length, 0);
});

/* ── the defects liability period starts AT handover ── */

const withWarranty = (): ForecastStage[] => {
  const list = stages(4);
  list.push({
    id: "warranty",
    name: "Defects liability period",
    phase: "After handover",
    position: 5,
    status: "not_started",
    plannedDays: 90,
    startedAt: null,
    completedAt: null,
    estimatedEnd: null,
  });
  return list;
};

test("the promised date is the keys, not the end of the 90-day warranty", () => {
  const target = new Date(Date.UTC(2027, 6, 30));
  const plan = backwardPlan({ target, stages: withWarranty(), today: new Date(Date.UTC(2026, 9, 17)) });

  const last = plan.targets[plan.targets.length - 1];
  assert.equal(last.name, "Stage 3", "the last stage before handover is the last one planned");
  assert.equal(last.dueBy.toISOString().slice(0, 10), "2027-07-30");
  assert.equal(plan.targets.some((t) => t.id === "warranty"), false, "the warranty is not a deadline");
});

test("the forecast handover window does not grow by the length of the warranty", () => {
  const today = new Date(Date.UTC(2026, 9, 17));
  const without = forecast({ startDate: null, stages: stages(4), wetDaysLost: 0, today });
  const withIt = forecast({ startDate: null, stages: withWarranty(), wetDaysLost: 0, today });
  assert.equal(withIt.handoverFrom?.getTime(), without.handoverFrom?.getTime());
});

test("a build with only the warranty left has nothing standing before handover", () => {
  const list = withWarranty().map((s) => (s.phase === "After handover" ? s : { ...s, status: "complete" }));
  assert.equal(forecast({ startDate: null, stages: list, wetDaysLost: 0 }).stages.length, 0);
});

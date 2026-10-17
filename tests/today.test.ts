import { test } from "node:test";
import assert from "node:assert/strict";
import { buildTasks } from "../lib/today-tasks";

const NOW = Date.UTC(2026, 9, 19);
const DAY = 86_400_000;

const house = (over: Record<string, unknown> = {}) => ({
  id: "h1",
  address: "1 Test Street",
  ownerReports: [],
  decisions: [],
  owners: [],
  updates: [{ occurredAt: new Date(NOW - DAY) }],
  _count: { updates: 0, owners: 1 },
  ...over,
});

const stage = (houseId: string, name: string, daysFromNow: number, address = "1 Test Street") => ({
  id: `${houseId}-${name}`,
  name,
  houseId,
  dueBy: new Date(NOW + daysFromNow * DAY),
  house: { address, lotNumber: null },
});

const build = (houses: unknown[], due: unknown[] = []) =>
  buildTasks(houses as never, due as never, NOW);

test("a house with nothing wrong produces nothing", () => {
  assert.equal(build([house()]).length, 0);
});

test("an owner waiting on an answer comes first", () => {
  const tasks = build(
    [house({ ownerReports: [{ body: "Is this right?", owner: { name: "Sarah" } }] }), house({ id: "h2", address: "2 Test Street" })],
    [stage("h2", "Roof", -3, "2 Test Street")]
  );
  assert.equal(tasks[0].kind, "report");
  assert.equal(tasks[0].urgency, 1);
});

test("an impossible promise is ONE line per house, not one per stage", () => {
  // Every remaining stage is past its date at once when a handover cannot be kept.
  const late = [
    stage("h1", "Roof", -60),
    stage("h1", "Windows", -50),
    stage("h1", "Tiling", -40),
    stage("h1", "Painting", -30),
  ];
  const tasks = build([house()], late).filter((t) => t.kind === "due");
  assert.equal(tasks.length, 1);
  assert.match(tasks[0].label, /Roof is 60 days past due/);
  assert.match(tasks[0].detail, /and 3 later stages behind it too/);
});

test("late stages in different houses each keep their own line", () => {
  const tasks = build(
    [house(), house({ id: "h2", address: "2 Test Street" })],
    [stage("h1", "Roof", -10), stage("h2", "Frame", -5, "2 Test Street")]
  ).filter((t) => t.kind === "due");
  assert.equal(tasks.length, 2);
});

test("a stage due tomorrow is its own line even when the house is also late", () => {
  const tasks = build([house()], [stage("h1", "Roof", -10), stage("h1", "Windows", 1)]).filter(
    (t) => t.kind === "due"
  );
  assert.equal(tasks.length, 2);
  const soon = tasks.find((t) => t.days === 1)!;
  assert.equal(soon.urgency, 6);
  assert.match(soon.label, /due in 1 day$/);
});

test("a house that has gone quiet is flagged, and one with a fresh update is not", () => {
  const quiet = build([house({ updates: [{ occurredAt: new Date(NOW - 9 * DAY) }] })]);
  assert.equal(quiet.some((t) => t.kind === "quiet" && /9 days/.test(t.label)), true);
  assert.equal(build([house()]).some((t) => t.kind === "quiet"), false);
});

test("an overdue decision counts, a future one does not", () => {
  const overdue = build([house({ decisions: [{ question: "Tapware?", dueDate: new Date(NOW - DAY) }] })]);
  assert.equal(overdue.some((t) => t.kind === "decision"), true);
  const future = build([house({ decisions: [{ question: "Tapware?", dueDate: new Date(NOW + 5 * DAY) }] })]);
  assert.equal(future.some((t) => t.kind === "decision"), false);
});

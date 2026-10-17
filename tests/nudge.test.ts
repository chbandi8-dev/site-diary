import { test } from "node:test";
import assert from "node:assert/strict";
import { composeNudge } from "../lib/nudge-text";
import type { Task } from "../lib/today";

const task = (over: Partial<Task>): Task => ({
  houseId: "h",
  address: "1 Test Street",
  urgency: 2,
  label: "Frame is 6 days past due",
  detail: "Behind the date you promised",
  kind: "due",
  ...over,
});
const OPTS = { origin: "https://example.test", dateLabel: "Monday 19 October" };

test("says nothing when nothing needs him", () => {
  assert.equal(composeNudge([], OPTS), null);
});

test("says nothing for work that is merely coming up, or only this week's housekeeping", () => {
  const quiet = [
    task({ urgency: 6, days: 6, label: "Roof due in 6 days" }),
    task({ urgency: 3, kind: "draft", label: "1 update never sent" }),
  ];
  assert.equal(composeNudge(quiet, OPTS), null);
});

test("lists what is late or waiting, and quotes the owner's own words", () => {
  const msg = composeNudge(
    [
      task({ urgency: 1, kind: "report", label: "Sarah is waiting on an answer", detail: "Is the waste meant to sit proud?" }),
      task({ urgency: 2, days: -6 }),
    ],
    OPTS
  )!;
  assert.match(msg.subject, /2 need you/);
  assert.match(msg.body, /LATE, OR WAITING ON YOU \(2\)/);
  assert.match(msg.body, /Is the waste meant to sit proud\?/);
  assert.match(msg.body, /https:\/\/example\.test\/admin/);
});

test("asks about anything due in the next two days, because the app cannot know if it is booked", () => {
  const msg = composeNudge([task({ urgency: 6, days: 1, label: "Roof due in 1 day" })], OPTS)!;
  assert.match(msg.body, /IS IT BOOKED\? \(1\)/);
  assert.match(msg.subject, /1 needs you/);
});

test("a stage three days out is not tonight's problem", () => {
  assert.equal(composeNudge([task({ urgency: 6, days: 3 })], OPTS), null);
});

test("a long list is cut short and says how many more", () => {
  const many = Array.from({ length: 12 }, (_, i) => task({ address: `${i} Test Street`, days: -1 }));
  const msg = composeNudge(many, OPTS)!;
  assert.match(msg.body, /\+ 4 more in the app/);
  assert.equal(msg.count, 12);
});

test("mentions the rest of the week without listing it", () => {
  const msg = composeNudge(
    [task({ days: -2 }), task({ urgency: 3, kind: "draft", label: "2 updates never sent" })],
    OPTS
  )!;
  assert.match(msg.body, /Also this week: 1 to close out\./);
  assert.doesNotMatch(msg.body, /never sent/);
});

test("a late house's expected window rides under its line", () => {
  const msg = composeNudge(
    [{ houseId: "h1", address: "1 Test Street", urgency: 2, label: "Frame is 4 days past due", detail: "x", kind: "due", days: -4, expected: "Promised 31 Dec · expected 14–28 Feb · about 9 weeks late" }],
    { origin: "https://example.test", dateLabel: "Monday" }
  )!;
  assert.match(msg.body, /past due — 1 Test Street\n   Promised 31 Dec · expected 14–28 Feb/);
});

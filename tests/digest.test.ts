import { test } from "node:test";
import assert from "node:assert/strict";
import { composeDigest } from "../lib/digest-text";

const fresh = new Date(Date.UTC(2026, 9, 1));
const base = {
  address: "1 Test Street",
  waitingOn: null,
  waitingOnEta: null,
  nextWeek: null,
  nextWeekSetAt: null,
  stages: [],
  updates: [],
  variations: [],
  weatherDays: [],
};

test("a quiet week still says something, and the channel only changes the sign-off", () => {
  const email = composeDigest(base, fresh);
  const wa = composeDigest(base, fresh, "whatsapp");
  assert.match(email, /No visible work on site this week/);
  assert.match(email, /reply on your build page/);
  assert.match(wa, /just reply here/);
  assert.equal(email.replace(/reply on your build page/, "X"), wa.replace(/just reply here/, "X"));
});

test("next week appears only while it is fresh", () => {
  const set = new Date(Date.UTC(2026, 9, 5));
  assert.match(composeDigest({ ...base, nextWeek: "Roof goes on", nextWeekSetAt: set }, fresh), /Next week:\nRoof goes on/);
  assert.doesNotMatch(
    composeDigest({ ...base, nextWeek: "Roof goes on", nextWeekSetAt: new Date(Date.UTC(2026, 8, 1)) }, fresh),
    /Next week/
  );
});

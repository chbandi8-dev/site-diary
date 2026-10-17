import { test } from "node:test";
import assert from "node:assert/strict";
import { parsePastedHouses, parseHandover, planStages, sentence } from "../lib/paste-import";

// Invented people and streets. The real list never goes in the repository.
const LIST = `These are current projects:

12 example street, parramatta

Owner
Jane Smith 0412 345 678

Storeys: double
Handover: March to April

Project status :
Rendering work

Next week schedule :
Rendering continues


5 Sample road , north rocks

Owners:-
Tom Brown & Ann Brown 0498 765 432

Project status:-
Rendering texture done
Electrical roughin done

Next week schedule :-
Aircon ducting
Bulkhead installation
Engineering inspection
Rendering colour
`;

const STAGES = [
  "Frame",
  "Roof",
  "External walls: brick, cladding or render",
  "Windows & external doors",
  "Rough-ins: plumbing, electrical & HVAC",
  "Wet-area waterproofing",
  "Insulation & internal linings",
];

test("reads each house, ignoring a heading before the first address", () => {
  const houses = parsePastedHouses(LIST);
  assert.equal(houses.length, 2);
  assert.equal(houses[0].address, "12 Example Street");
  assert.equal(houses[1].address, "5 Sample Road");
});

test("tidies the suburb, including a space before the comma", () => {
  const houses = parsePastedHouses(LIST);
  assert.equal(houses[0].suburb, "Parramatta");
  assert.equal(houses[1].suburb, "North Rocks");
});

test("owners split on & and keep a mobile written after the name", () => {
  const [a, b] = parsePastedHouses(LIST);
  assert.deepEqual(a.owners, [{ name: "Jane Smith", phone: "0412 345 678" }]);
  assert.deepEqual(b.owners, [
    { name: "Tom Brown", phone: null },
    { name: "Ann Brown", phone: "0498 765 432" },
  ]);
});

test("reads storeys and handover when they are given", () => {
  const [a, b] = parsePastedHouses(LIST);
  assert.equal(a.storeys, 2);
  assert.ok(a.handoverFrom && a.handoverTo);
  assert.equal(b.storeys, null);
  assert.equal(b.handoverTo, null);
});

test("'Handover pack sent' under a status is an item, not a heading", () => {
  const [h] = parsePastedHouses(
    "1 Test Lane, Parramatta\n\nProject status:\nHandover pack sent\nPainting done\n"
  );
  assert.deepEqual(h.status, ["Handover pack sent", "Painting done"]);
  assert.equal(h.handoverTo, null);
});

test("a house is never invented from text with no address", () => {
  assert.equal(parsePastedHouses("Owner\nJane Smith\nProject status:\nRendering").length, 0);
});

test("stages: started and still going is underway, only-next-week is booked", () => {
  const [, b] = parsePastedHouses(LIST);
  const { plan, unmatched } = planStages(b.status, b.next, STAGES);
  const by = Object.fromEntries(plan.map((p) => [p.stage.split(":")[0], p.status]));
  assert.equal(by["External walls"], "in_progress");
  assert.equal(by["Rough-ins"], "in_progress");
  assert.equal(by["Insulation & internal linings"], "scheduled");
  assert.deepEqual(unmatched, ["Engineering inspection"]);
});

test("stages: done and not coming up again is complete", () => {
  const { plan } = planStages(["Roof tiles done"], ["Gutters"], STAGES);
  assert.deepEqual(plan, [{ stage: "Roof", status: "complete" }]);
});

test("a line that matches no stage is reported, never guessed", () => {
  const { plan, unmatched } = planStages(["Council inspection"], [], STAGES);
  assert.equal(plan.length, 0);
  assert.deepEqual(unmatched, ["Council inspection"]);
});

test("next week keeps his words, only tidied", () => {
  assert.equal(sentence(["aircon ducting", "rendering colour"]), "Aircon ducting. Rendering colour.");
});

/* ── handover dates ── */

const OCT_2026 = new Date(Date.UTC(2026, 9, 17));

test("a month on its own is the whole month, and means the next one to come", () => {
  assert.deepEqual(parseHandover("March", OCT_2026), { from: "2027-03-01", to: "2027-03-31" });
  assert.deepEqual(parseHandover("November", OCT_2026), { from: "2026-11-01", to: "2026-11-30" });
});

test("a window is read to its far end", () => {
  assert.deepEqual(parseHandover("March to April", OCT_2026), { from: "2027-03-01", to: "2027-04-30" });
  assert.deepEqual(parseHandover("March - April 2028", OCT_2026), { from: "2028-03-01", to: "2028-04-30" });
});

test("a window that crosses the new year lands in the right years", () => {
  assert.deepEqual(parseHandover("December to February", OCT_2026), { from: "2026-12-01", to: "2027-02-28" });
});

test("exact dates, in the order Australians write them", () => {
  assert.deepEqual(parseHandover("30/4/2027", OCT_2026), { from: "2027-04-30", to: "2027-04-30" });
  assert.deepEqual(parseHandover("30 April 2027", OCT_2026), { from: "2027-04-30", to: "2027-04-30" });
  assert.deepEqual(parseHandover("2027-04-30", OCT_2026), { from: "2027-04-30", to: "2027-04-30" });
});

test("nothing recognisable gives nothing, never a guess", () => {
  assert.equal(parseHandover("soon", OCT_2026), null);
  assert.equal(parseHandover("", OCT_2026), null);
});

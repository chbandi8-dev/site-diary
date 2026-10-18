import { test } from "node:test";
import assert from "node:assert/strict";
import { TOOLS, interpretToolCalls } from "../lib/assistant-tools";
import { proposeActions, matchOwner, matchDefect, type HouseCtx } from "../lib/assistant-propose";
import { payload } from "../lib/assistant-payload";

const UUID = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const STAGES = ["Frame", "Roof", "Tiling"];
const call = (name: string, input: Record<string, unknown>) => ({ type: "tool_use", name, input });
const run = (...blocks: ReturnType<typeof call>[]) =>
  interpretToolCalls(blocks, { houseNumbers: new Set([1, 2]), stageNames: STAGES, today: "2026-10-19" });

const HOUSE: HouseCtx = {
  id: UUID(1),
  label: "15 Example Street, Parramatta",
  owners: [
    { id: UUID(11), name: "Arny Smith", phone: "0400 000 001" },
    { id: UUID(12), name: "Priya Smith", phone: null },
  ],
  openDefects: [
    { id: UUID(21), reference: "1", location: "Hallway", description: "Scuff on the architrave" },
    { id: UUID(22), reference: "2", location: "Kitchen", description: "Cabinet door not closing" },
  ],
};
const houseAt = (n: number) => (n === 1 ? HOUSE : undefined);

// One realistic call per tool. A tool with no sample here fails the wiring test
// below, so adding a tool without wiring it all the way through cannot go unnoticed.
const SAMPLE: Record<string, Record<string, unknown>> = {
  set_stage: { house: 1, stage: "Frame", status: "complete" },
  add_private_note: { house: 1, body: "Brickie still owes two days." },
  draft_owner_update: { house: 1, body: "The frame is up.", kind: "milestone" },
  set_waiting_on: { house: 1, waitingOn: "kitchen selections", eta: "2026-10-30" },
  set_next_week: { house: 1, body: "Roof goes on Tuesday." },
  log_wet_day: { house: 1, date: "2026-10-18" },
  log_defect: { house: 1, location: "Bathroom", description: "Grout missing", target: "2026-11-02" },
  set_owner_contact: { house: 1, name: "Arny", phone: "0419 696 104" },
  send_owner_message: { house: 1, body: "The roof starts Tuesday.", to: "Arny" },
  set_handover: { house: 1, from: "2027-05-01", to: "2027-05-31" },
  set_inspection: { house: 1, inspection: "frame", status: "booked", date: "2026-10-21" },
  set_house_status: { house: 1, status: "handed_over" },
  resolve_defect: { house: 1, defect: "2" },
  add_trade: { name: "Dave", trade: "Electrician", phone: "0412 345 678" },
  record_new_house: { address: "22 Hillcrest Avenue", suburb: "Baulkham Hills", storeys: 2, owners: [{ name: "Chen" }] },
};

test("every tool the model is offered is wired from call to approval to apply", () => {
  for (const tool of TOOLS) {
    const input = SAMPLE[tool.name];
    assert.ok(input, `no sample for tool ${tool.name} — wire it through and add one`);

    const actions = run(call(tool.name, input));
    assert.equal(actions.length, 1, `${tool.name} produced ${actions.length} actions`);

    const { actions: proposed } = proposeActions(actions, houseAt);
    assert.equal(proposed.length, 1, `${tool.name} produced no checklist line`);
    assert.ok(proposed[0].title.length > 3);

    const ok = payload.safeParse(proposed[0].payload);
    assert.ok(ok.success, `${tool.name} payload would be refused by apply: ${JSON.stringify(ok.error?.issues)}`);
  }
  assert.equal(Object.keys(SAMPLE).length, TOOLS.length, "a sample exists for a tool that is not offered");
});

test("the house number must be one of his; a stage must be on the standard list", () => {
  assert.equal(run(call("set_stage", { house: 9, stage: "Frame", status: "complete" })).length, 0);
  assert.equal(run(call("set_stage", { house: 1, stage: "Invented stage", status: "complete" })).length, 0);
  assert.equal(run(call("set_stage", { house: 1, stage: "Frame", status: "finished" })).length, 0);
  assert.equal(run(call("set_stage", {})).length, 0);
});

test("handover: a month is a window, one date is a one-day window, none is nothing", () => {
  const [a] = run(call("set_handover", { house: 1, to: "2027-04-30" }));
  assert.deepEqual([a.kind === "handover" && a.from, a.kind === "handover" && a.to], ["2027-04-30", "2027-04-30"]);
  assert.equal(run(call("set_handover", { house: 1 })).length, 0);
  assert.equal(run(call("set_handover", { house: 1, to: "end of April" })).length, 0);
  const [swapped] = run(call("set_handover", { house: 1, from: "2027-05-31", to: "2027-05-01" }));
  assert.ok(swapped.kind === "handover" && swapped.from! <= swapped.to!);
});

test("inspections: 'other' needs a name; a result carries no booking date", () => {
  assert.equal(run(call("set_inspection", { house: 1, inspection: "other", status: "booked" })).length, 0);
  const [eng] = run(call("set_inspection", { house: 1, inspection: "other", label: "Engineer's", status: "booked", date: "2026-10-21" }));
  assert.ok(eng.kind === "inspection" && eng.label === "Engineer's" && eng.date === "2026-10-21");
  const [passed] = run(call("set_inspection", { house: 1, inspection: "frame", status: "passed", date: "2026-10-21" }));
  assert.ok(passed.kind === "inspection" && passed.date === null);
  assert.equal(run(call("set_inspection", { house: 1, inspection: "roof", status: "booked" })).length, 0);
  assert.equal(run(call("set_inspection", { house: 1, inspection: "frame", status: "maybe" })).length, 0);
});

test("handing a house over needs an explicit status", () => {
  assert.equal(run(call("set_house_status", { house: 1 })).length, 0);
  assert.equal(run(call("set_house_status", { house: 1, status: "finished" })).length, 0);
});

test("a phone number with no digits is a mishearing, not a number", () => {
  assert.equal(run(call("set_owner_contact", { house: 1, name: "Arny", phone: "oh four one" })).length, 0);
  assert.equal(run(call("add_trade", { name: "Dave", trade: "Sparky", phone: "call him" }))[0].kind, "trade");
  const trade = run(call("add_trade", { name: "Dave", trade: "Sparky", phone: "call him" }))[0];
  assert.ok(trade.kind === "trade" && trade.phone === null);
});

test("dates that are not dates are dropped, not repaired", () => {
  const [w] = run(call("set_waiting_on", { house: 1, waitingOn: "tiles", eta: "next Tuesday" }));
  assert.ok(w.kind === "waiting" && w.eta === null);
  const [d] = run(call("log_wet_day", { house: 1, date: "yesterday" }));
  assert.ok(d.kind === "wet_day" && d.date === "2026-10-19", "falls back to today");
});

test("several things in one breath come out as several actions, in order", () => {
  const actions = run(
    call("set_stage", { house: 1, stage: "Frame", status: "complete" }),
    call("set_inspection", { house: 1, inspection: "frame", status: "passed" }),
    call("set_next_week", { house: 2, body: "Roof starts Tuesday" }),
    { type: "text", name: undefined, input: undefined } as never
  );
  assert.deepEqual(actions.map((a) => a.kind), ["stage", "inspection", "next_week"]);
});

test("a house the model named that is not on the list is never proposed", () => {
  const actions = run(call("add_private_note", { house: 2, body: "x" }));
  assert.equal(actions.length, 1);
  assert.equal(proposeActions(actions, houseAt).actions.length, 0);
});

test("matching a spoken first name to the owners on the house", () => {
  assert.equal(matchOwner("Arny", HOUSE.owners)?.id, UUID(11));
  assert.equal(matchOwner("arny smith", HOUSE.owners)?.id, UUID(11));
  assert.equal(matchOwner("Smith", HOUSE.owners), null, "two Smiths: do not guess");
  assert.equal(matchOwner("Bob", HOUSE.owners), null);
});

test("owner contact proposes a fix for the person, or adds them", () => {
  const fix = proposeActions(run(call("set_owner_contact", { house: 1, name: "Arny", phone: "0419 696 104" })), houseAt).actions[0];
  assert.match(fix.title, /Save Arny Smith's mobile/);
  assert.match(fix.footnote ?? "", /Replaces 0400 000 001/);
  assert.equal(fix.payload.kind === "owner" && fix.payload.ownerId, UUID(11));
  const add = proposeActions(run(call("set_owner_contact", { house: 1, name: "Bob", phone: "0419 696 104" })), houseAt).actions[0];
  assert.match(add.title, /Add Bob as an owner/);
  assert.equal(add.payload.kind === "owner" && add.payload.ownerId, null);
});

test("matching a defect by number or by his words, and refusing to guess", () => {
  assert.equal(matchDefect("2", HOUSE.openDefects)?.id, UUID(22));
  assert.equal(matchDefect("#1", HOUSE.openDefects)?.id, UUID(21));
  assert.equal(matchDefect("number 2", HOUSE.openDefects)?.id, UUID(22));
  assert.equal(matchDefect("hallway", HOUSE.openDefects)?.id, UUID(21));
  assert.equal(matchDefect("door", HOUSE.openDefects)?.id, UUID(22));
  assert.equal(matchDefect("paint", HOUSE.openDefects), null);
  assert.equal(matchDefect("9", HOUSE.openDefects), null);
});

test("a defect that cannot be placed says so instead of closing the wrong one", () => {
  const r = proposeActions(run(call("resolve_defect", { house: 1, defect: "the paint" })), houseAt);
  assert.equal(r.actions.length, 0);
  assert.match(r.notes[0], /Couldn't tell which defect "the paint"/);
});

test("anything an owner will read says so, and nothing emails from here", () => {
  const all = proposeActions(
    run(
      call("set_handover", { house: 1, to: "2027-05-31" }),
      call("set_house_status", { house: 1, status: "handed_over" }),
      call("resolve_defect", { house: 1, defect: "1" }),
      call("set_inspection", { house: 1, inspection: "frame", status: "failed" })
    ),
    houseAt
  ).actions;
  assert.deepEqual(all.map((a) => a.seenBy), ["owners", "owners", "owners", "you"]);
  assert.match(all[0].footnote ?? "", /Nobody is emailed/);
  assert.match(all[2].footnote ?? "", /no email is sent/);
});

test("an owner update is only ever proposed as a draft", () => {
  const p = proposeActions(run(call("draft_owner_update", { house: 1, body: "Frame is up." })), houseAt).actions[0];
  assert.match(p.footnote ?? "", /unsent/i);
});

test("a message he wants to send: kept as given, to one owner or everyone, never to a guess", () => {
  const one = proposeActions(run(call("send_owner_message", { house: 1, body: "Roof starts Tuesday.", to: "Arny" })), houseAt);
  assert.match(one.actions[0].title, /^Send this to Arny on WhatsApp$/);
  assert.deepEqual(one.actions[0].payload.kind === "send" && one.actions[0].payload.ownerIds, [UUID(11)]);
  assert.equal(one.actions[0].bodyField, "body", "the words are editable before anything happens");

  const all = proposeActions(run(call("send_owner_message", { house: 1, body: "Frame is up." })), houseAt);
  assert.match(all.actions[0].title, /^Send this to Arny & Priya on WhatsApp$/);
  assert.equal(all.notes.length, 0);

  const unknown = proposeActions(run(call("send_owner_message", { house: 1, body: "Hi", to: "Bob" })), houseAt);
  assert.equal(unknown.actions[0].payload.kind === "send" && unknown.actions[0].payload.ownerIds.length, 2);
  assert.match(unknown.notes[0], /Couldn't tell which owner "Bob"/);

  const ambiguous = proposeActions(run(call("send_owner_message", { house: 1, body: "Hi", to: "Smith" })), houseAt);
  assert.match(ambiguous.notes[0], /Couldn't tell which owner "Smith"/, "two Smiths: say so, do not pick one");
});

test("a message with no words, or no house, is nothing; a delay says it is held as a draft", () => {
  assert.equal(run(call("send_owner_message", { house: 1, body: "   " })).length, 0);
  assert.equal(run(call("send_owner_message", { body: "Hi" })).length, 0);
  const delay = proposeActions(run(call("send_owner_message", { house: 1, body: "We're a week behind.", kind: "delay" })), houseAt).actions[0];
  assert.match(delay.footnote ?? "", /saved as a draft first/i);
  const odd = run(call("send_owner_message", { house: 1, body: "Hi", kind: "gossip" }))[0];
  assert.ok(odd.kind === "send" && odd.messageKind === "message");
});

test("send is told apart from draft: draft_owner_update never carries a WhatsApp target", () => {
  const d = proposeActions(run(call("draft_owner_update", { house: 1, body: "x" })), houseAt).actions[0];
  assert.equal(d.payload.kind, "update");
  assert.doesNotMatch(d.title, /WhatsApp/);
});

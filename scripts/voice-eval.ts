/**
 * Does the "Say it" button understand what he says?
 *
 * The unit tests prove everything AFTER the model: that each thing it can call
 * is checked, shown for approval and carried out. They cannot prove the model
 * picks the right thing for a sentence, because that is the model's judgement.
 * This does, against the real one, on phrases in the way he talks.
 *
 *   ANTHROPIC_API_KEY=... npm run eval:voice
 *
 * It costs a few cents and writes nothing. Run it after any change to the
 * tool descriptions or the prompt in lib/assistant.ts, and add a phrase here
 * whenever the real app mishears one.
 */

import { readActionsFromSpeech } from "../lib/assistant";

const HOUSES = [
  { n: 1, label: "45 Bombala Street, Pendle Hill, Srinivas Sailada", stageNames: [] },
  { n: 2, label: "15 Mardi Street, Girraween, Arny Saha & Priyanka Saha", stageNames: [] },
  { n: 3, label: "6 Delgaun Place, Baulkham Hills, Sirajee", stageNames: [] },
];
const STAGES = [
  "Frame", "Roof", "External walls: brick, cladding or render", "Windows & external doors",
  "Rough-ins: plumbing, electrical & HVAC", "Tiling", "Painting", "Handover & keys",
];

type Case = { say: string; current?: number; expect: { kind: string; house?: number; check?: (a: any) => boolean }[] };

const CASES: Case[] = [
  { say: "Mardi Street, the frame's done", expect: [{ kind: "stage", house: 2, check: (a) => a.stage === "Frame" && a.status === "complete" }] },
  { say: "Brickies have started on Bombala", expect: [{ kind: "stage", house: 1, check: (a) => /External walls/.test(a.stage) && a.status === "in_progress" }] },
  { say: "Roof's booked for next week at Delgaun Place", expect: [{ kind: "stage", house: 3 }] },
  { say: "Private note on Mardi, the tiler turned up two hours late", expect: [{ kind: "note", house: 2 }] },
  { say: "Draft the owners at Bombala something about the rendering going well", expect: [{ kind: "update", house: 1 }] },
  { say: "Waiting on tile selections at Mardi Street", expect: [{ kind: "waiting", house: 2, check: (a) => /tile/i.test(a.waitingOn ?? "") }] },
  { say: "Next week at Delgaun is roof installation", expect: [{ kind: "next_week", house: 3 }] },
  { say: "Yesterday was a wet day at Bombala", expect: [{ kind: "wet_day", house: 1 }] },
  { say: "There's a scratch on the kitchen bench at Mardi", expect: [{ kind: "defect", house: 2 }] },
  { say: "Arny's number is 0419 696 104", current: 2, expect: [{ kind: "owner", house: 2, check: (a) => /Arny/i.test(a.name) && /0419/.test(a.phone ?? "") }] },
  { say: "Sirajee's mobile is 0424 382 505", expect: [{ kind: "owner", house: 3 }] },
  { say: "Handover at Delgaun Place is end of May", expect: [{ kind: "handover", house: 3, check: (a) => (a.to ?? "").slice(5, 7) === "05" }] },
  { say: "Bombala's pushed to the end of June", expect: [{ kind: "handover", house: 1, check: (a) => (a.to ?? "").slice(5, 7) === "06" }] },
  { say: "Frame inspection at Mardi is booked for Wednesday", expect: [{ kind: "inspection", house: 2, check: (a) => a.inspection === "frame" && a.status === "booked" && !!a.date }] },
  { say: "Waterproofing passed at Bombala", expect: [{ kind: "inspection", house: 1, check: (a) => a.inspection === "waterproofing" && a.status === "passed" }] },
  { say: "Engineer's inspection failed at Mardi Street", expect: [{ kind: "inspection", house: 2, check: (a) => a.inspection === "other" && /engineer/i.test(a.label ?? "") && a.status === "failed" }] },
  { say: "Mardi Street has been handed over", expect: [{ kind: "house_status", house: 2, check: (a) => a.status === "handed_over" }] },
  { say: "Add Dave, plumber, 0412 345 678", expect: [{ kind: "trade", check: (a) => /Dave/.test(a.name) && /plumb/i.test(a.trade) }] },
  { say: "New house, 22 Hillcrest Avenue Baulkham Hills, double storey, the Rileys", expect: [{ kind: "house" }] },
  {
    say: "Mardi, frame's done and the frame inspection passed, roof starts Tuesday. Private note, the brickie owes me two days.",
    expect: [{ kind: "stage", house: 2 }, { kind: "inspection", house: 2 }, { kind: "note", house: 2 }],
  },
  { say: "Frame's done", current: 1, expect: [{ kind: "stage", house: 1 }] },
  { say: "Tell Arny at Mardi the roof starts Tuesday", expect: [{ kind: "send", house: 2, check: (a) => /Arny/i.test(a.to ?? "") && /roof/i.test(a.body) }] },
  { say: "Send the owners at Bombala a message that the rendering is finished", expect: [{ kind: "send", house: 1 }] },
  {
    say: "This is the message I want to send to Sirajee: Hi Sirajee, the roof tiles are delivered and the roofers start Monday. Cheers.",
    current: 3,
    expect: [{ kind: "send", house: 3, check: (a) => /roofers start Monday/.test(a.body) && /Hi Sirajee/.test(a.body) }],
  },
  { say: "Draft the owners at Mardi something about the frame", expect: [{ kind: "update", house: 2 }] },
  // Things that must NOT become actions.
  { say: "Nice weather today", expect: [] },
  { say: "Frame's done", expect: [] }, // no house named, none open: do not guess
];

async function main() {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("Set ANTHROPIC_API_KEY to run this.");
    process.exit(2);
  }
  let failed = 0;
  for (const c of CASES) {
    const result = await readActionsFromSpeech({
      transcript: c.say,
      houses: HOUSES,
      currentHouse: c.current ?? null,
      stageNames: STAGES,
    });
    const got = result.actions as any[];
    const problems: string[] = [];
    if (got.length !== c.expect.length) problems.push(`wanted ${c.expect.length} action(s), got ${got.length}`);
    c.expect.forEach((want) => {
      const hit = got.find(
        (a) => a.kind === want.kind && (want.house === undefined || a.house === want.house) && (!want.check || want.check(a))
      );
      if (!hit) problems.push(`no ${want.kind}${want.house ? ` on house ${want.house}` : ""} that fits`);
    });
    if (problems.length) failed++;
    console.log(`${problems.length ? "FAIL" : "PASS"}  “${c.say}”${problems.length ? `\n      ${problems.join("; ")}\n      got: ${JSON.stringify(got)}` : ""}`);
  }
  console.log(`\n${CASES.length - failed} of ${CASES.length} understood`);
  process.exit(failed ? 1 : 0);
}

main();

import Anthropic from "@anthropic-ai/sdk";
import { SYDNEY_SUBURBS } from "./suburbs";
import { TOOLS, interpretToolCalls, type Action } from "./assistant-tools";

export * from "./assistant-tools";

/**
 * Saying what happened today and having the app do it.
 *
 * He is standing in a driveway with a phone in one hand. Every screen in here
 * costs him taps he does not have: open the house, find the stage, tap it,
 * scroll to notes, type, scroll to the owner update, type again. Spoken, the
 * same five minutes is fifteen seconds:
 *
 *   "Lot 114, frame's done and the roof starts Tuesday. Private note — the
 *    brickie still owes me two days and I'm not wearing that. Draft the owners
 *    something about the frame going up."
 *
 * Three rules, and the first is the whole safety model:
 *
 * 1. NOTHING HERE WRITES. This returns a list of proposed actions. The screen
 *    shows them as a checklist he can edit and untick, and only his tap
 *    applies them. A mishearing costs him one correction; applied silently it
 *    would cost a stage marked complete on the wrong house, or worse, an email
 *    to a homeowner he never wrote.
 * 2. Nothing is invented. A field he did not speak about comes back empty, and
 *    an instruction it cannot place on a house comes back not at all.
 * 3. An owner-facing message is only ever DRAFTED. He reads every word that
 *    leaves this app under his name — see `app/api/pm/assistant/apply`, which
 *    forces every assistant-written update to an unsent draft regardless of
 *    what comes back from here.
 *
 * The counterpart to `lib/intake.ts`, which does the same job for one action
 * (adding a house) and is kept separate because its form is a different shape.
 */

const SYSTEM = `You turn a residential builder's spoken note into a list of actions for his site-diary app to carry out.

The speaker is a project manager running 20-25 houses around Sydney, plus lots
in a developer's estate. He is dictating on a phone, on site, quickly, often
covering several houses and several different things in one breath.

Your job is to call one tool per thing he asked for. Several tools in one
response is normal and expected. Call nothing at all if you genuinely cannot
tell what he wants — a wrong action is far more expensive than no action,
because he has to notice it and undo it.

WHICH HOUSE. Every tool except record_new_house and add_trade takes a "house" number,
referring to the numbered list given below. Match on the street, the lot
number, the suburb, or the owners' names — he refers to his own jobs however
comes to mind. If he is on one house's screen it is marked as the current
house, and anything he says without naming a house belongs to it. If he names
no house and there is no current house, do not guess: leave that instruction
out.

WHAT EACH TOOL IS FOR.

 - set_stage: where the build is up to. "Frame's done", "they've started the
   roof", "slab's not actually poured yet". The stage name must be copied
   EXACTLY from the allowed list. Match on meaning, not wording — "brickies
   are on" is the external walls stage, "sparky's roughing in" is the
   rough-ins stage. If you cannot tell which stage he means, leave it out.
 - add_private_note: anything he says is private, for himself, not for the
   owners — "note to self", "private note", "don't tell them", or plainly
   internal content like what a subcontractor owes him or what a job is
   costing. Write it as a site-diary entry in his own words, tidied: these are
   discoverable in a dispute, so keep it factual and drop anything that reads
   as venting rather than as a record.
 - draft_owner_update: a message for the homeowners. ALWAYS a draft — he sends
   it himself. Write it for the owners to read: plain words, no trade jargon,
   no stage numbers, two or three sentences, warm but not chatty, and never a
   promise about a date he did not give you. If he dictated the words himself,
   keep his words.
 - set_waiting_on: the one thing holding this house up, as a short phrase, plus
   when he expects it if he said. Owners see this.
 - set_next_week: what is happening on this house next week. Owners see this.
 - log_wet_day: a day lost to weather. Default the date to today unless he says
   otherwise.
 - log_defect: something that needs fixing. Location and description.
 - set_owner_contact: an owner's mobile number or email for a house that is
   already on the list — "Arny's number is 0419 696 104", "add Priyanka's
   mobile". Give the person's name as he said it and copy the number or email
   exactly. Never invent or complete a number. Use this, not a note, for
   contact details.
 - send_owner_message: a message for the owners that he wants to SEND — "send
   Arny the roof's on Tuesday", "message the Sahas that the frame's done", "this
   is the message I want to send to the client: …". It goes to WhatsApp for him
   to tap send, after he has read it. If he dictated the words, keep them as
   they are — do not rewrite, soften or add to them; only fix plain dictation
   mistakes. If he only gave the gist ("tell Arny the roof's on"), write it
   for him: plain words, warm but short, no jargon, and no date he did not
   give. If he names one owner, put their name in "to"; otherwise it is for
   everyone on the house. Use draft_owner_update only when he says "draft".
 - set_handover: when a house will be handed over — "handover's end of May",
   "Mardi's pushed to the middle of March". A month or "end of" is a window:
   give the first and last day he implies. Owners see this date. Never use it
   for a date he is only guessing at.
 - set_inspection: an inspection on a house — "frame inspection's booked for
   Wednesday", "footings passed", "waterproofing failed, needs redoing". Pick
   the closest kind from the list; for any other (the engineer's inspection, the
   fire certifier) use "other" and say what it is in the label. Booked needs the
   date if he gave one.
 - set_house_status: ONLY when he says a house has been handed over, or that
   one is being reopened. Never infer it from the build being nearly done.
 - resolve_defect: a defect he says is fixed — "number seven's done", "the
   scuff in the hallway is sorted". Give the number or his words.
 - add_trade: a tradesperson for his address book — "add Dave, sparky,
   0412 ...". Takes no house number.
 - record_new_house: a house he is adding to the books. Takes no house number.

DICTATION ERRORS. This arrives from phone dictation, which mangles Australian
place names badly: "Wentworthville" as "went worth ville" or "Wentworth Bill",
"Toongabbie" as "tune gabby", "Baulkham Hills" as "balcom hills", "D'Arcy
Road" as "Darcy Road". Correct these where you are genuinely confident, judging
on how it SOUNDS rather than how it is spelled. Where his own house list has
an address that is clearly the same one misheard, prefer that spelling exactly.
If it does not plainly match, keep what he said.

DATES. Return YYYY-MM-DD. Resolve "Tuesday", "next week", "March" against
today's date, given below. Never return a date he did not indicate.`;

let client: Anthropic | null = null;

function anthropic(): Anthropic {
  if (client) return client;
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY is not set — voice capture is unavailable.");
  }
  client = new Anthropic();
  return client;
}

export type HouseRef = {
  /** 1-based, as shown to the model. */
  n: number;
  label: string;
  stageNames: string[];
};

export type Interpretation = {
  actions: Action[];
  /** What it said when it could not place something. Shown to him verbatim. */
  note: string | null;
};

export async function readActionsFromSpeech(opts: {
  transcript: string;
  /** His houses, numbered. The model refers to them by number. */
  houses: HouseRef[];
  /** The house whose screen he is on, if any — the default for anything unnamed. */
  currentHouse: number | null;
  /** The standard stage list. Stage names are validated against it. */
  stageNames: string[];
}): Promise<Interpretation> {
  const today = new Date().toISOString().slice(0, 10);

  const response = await anthropic().messages.create({
    model: "claude-opus-5",
    max_tokens: 2000,
    system: SYSTEM,
    // Extraction from a short spoken note, used standing on a site. Low effort
    // is what keeps it quick enough to be worth using at all.
    output_config: { effort: "low" },
    tools: TOOLS,
    messages: [
      {
        role: "user",
        content: [
          `Today is ${today}.`,
          ``,
          `His houses:`,
          opts.houses
            .map(
              (h) =>
                `${h.n}. ${h.label}${opts.currentHouse === h.n ? "   ← the screen he is on now" : ""}`
            )
            .join("\n"),
          ``,
          `Allowed stage names:`,
          opts.stageNames.map((n) => `- ${n}`).join("\n"),
          ``,
          `Sydney suburbs, for correcting dictation:`,
          SYDNEY_SUBURBS.join(", "),
          ``,
          `What he said:`,
          `"""`,
          opts.transcript.trim(),
          `"""`,
        ]
          .filter((line) => line !== ``)
          .join("\n"),
      },
    ],
  });

  const actions = interpretToolCalls(response.content, {
    houseNumbers: new Set(opts.houses.map((h) => h.n)),
    stageNames: opts.stageNames,
    today,
  });

  // Whatever it said alongside the tool calls. Usually empty; when it is not,
  // it is the reason something is missing — which house it could not place, or
  // which stage it was not sure about — and that is worth showing him.
  const note = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text.trim())
    .filter(Boolean)
    .join("\n\n");

  return { actions, note: note || null };
}

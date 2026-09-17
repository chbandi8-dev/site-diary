import Anthropic from "@anthropic-ai/sdk";
import { SYDNEY_SUBURBS } from "@/lib/suburbs";

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

WHICH HOUSE. Every tool except record_new_house takes a "house" number,
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

export type Action =
  | { kind: "stage"; house: number; stage: string; status: StageStatus }
  | { kind: "note"; house: number; body: string }
  | { kind: "update"; house: number; body: string; updateKind: UpdateKind }
  | { kind: "waiting"; house: number; waitingOn: string | null; eta: string | null }
  | { kind: "next_week"; house: number; body: string }
  | { kind: "wet_day"; house: number; date: string; note: string | null }
  | { kind: "defect"; house: number; location: string | null; description: string; target: string | null }
  | {
      kind: "house";
      address: string;
      suburb: string | null;
      storeys: 1 | 2 | null;
      owners: { name: string; email: string | null }[];
      currentStage: string | null;
      waitingOn: string | null;
      handoverFrom: string | null;
      handoverTo: string | null;
    };

export type StageStatus =
  | "not_started"
  | "scheduled"
  | "in_progress"
  | "on_hold"
  | "complete"
  | "not_applicable";

export type UpdateKind = "progress" | "delay" | "milestone" | "weather" | "message";

const HOUSE_REF = {
  type: "integer" as const,
  description: "The number of the house from the numbered list.",
};

const TOOLS: Anthropic.Tool[] = [
  {
    name: "set_stage",
    description: "Move a stage of one house to a new status.",
    input_schema: {
      type: "object",
      properties: {
        house: HOUSE_REF,
        stage: { type: "string", description: "Exactly one name from the allowed stage list." },
        status: {
          type: "string",
          enum: ["not_started", "scheduled", "in_progress", "on_hold", "complete", "not_applicable"],
        },
      },
      required: ["house", "stage", "status"],
    },
  },
  {
    name: "add_private_note",
    description:
      "Add an entry to his own private site diary for one house. Owners never see these.",
    input_schema: {
      type: "object",
      properties: { house: HOUSE_REF, body: { type: "string" } },
      required: ["house", "body"],
    },
  },
  {
    name: "draft_owner_update",
    description:
      "Draft a message to the homeowners of one house. Saved unsent for him to read and send.",
    input_schema: {
      type: "object",
      properties: {
        house: HOUSE_REF,
        body: { type: "string", description: "Written for the owners to read." },
        kind: {
          type: "string",
          enum: ["progress", "delay", "milestone", "weather", "message"],
          description: "delay if it tells them something is running late.",
        },
      },
      required: ["house", "body"],
    },
  },
  {
    name: "set_waiting_on",
    description: "Set what is holding one house up. Owners see this.",
    input_schema: {
      type: "object",
      properties: {
        house: HOUSE_REF,
        waitingOn: { type: "string", description: "A short phrase. Empty clears it." },
        eta: { type: "string", description: "YYYY-MM-DD, when he expects it." },
      },
      required: ["house"],
    },
  },
  {
    name: "set_next_week",
    description: "Set what is happening on one house next week. Owners see this.",
    input_schema: {
      type: "object",
      properties: { house: HOUSE_REF, body: { type: "string" } },
      required: ["house", "body"],
    },
  },
  {
    name: "log_wet_day",
    description: "Record a day lost to weather on one house.",
    input_schema: {
      type: "object",
      properties: {
        house: HOUSE_REF,
        date: { type: "string", description: "YYYY-MM-DD. Today if he did not say." },
        note: { type: "string" },
      },
      required: ["house"],
    },
  },
  {
    name: "log_defect",
    description: "Record something that needs fixing on one house.",
    input_schema: {
      type: "object",
      properties: {
        house: HOUSE_REF,
        location: { type: "string", description: "Room or area." },
        description: { type: "string" },
        target: { type: "string", description: "YYYY-MM-DD, when it should be fixed by." },
      },
      required: ["house", "description"],
    },
  },
  {
    name: "record_new_house",
    description: "A house he is adding to the books. Not for a house already on the list.",
    input_schema: {
      type: "object",
      properties: {
        address: { type: "string", description: "Street number and street name." },
        suburb: { type: "string" },
        storeys: { type: "integer", enum: [1, 2] },
        owners: {
          type: "array",
          items: {
            type: "object",
            properties: { name: { type: "string" }, email: { type: "string" } },
            required: ["name"],
          },
        },
        currentStage: { type: "string", description: "Exactly one name from the allowed list." },
        waitingOn: { type: "string" },
        handoverFrom: { type: "string", description: "YYYY-MM-DD" },
        handoverTo: { type: "string", description: "YYYY-MM-DD" },
      },
      required: ["address"],
    },
  },
];

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Anything malformed is dropped rather than shown — a bad date he skims past gets saved. */
function cleanDate(value: unknown): string | null {
  if (typeof value !== "string" || !ISO_DATE.test(value)) return null;
  return Number.isNaN(new Date(`${value}T00:00:00Z`).getTime()) ? null : value;
}

function cleanText(value: unknown, max = 400): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().slice(0, max);
  return trimmed || null;
}

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

  const known = new Set(opts.stageNames);
  const houseNumbers = new Set(opts.houses.map((h) => h.n));
  const actions: Action[] = [];

  for (const block of response.content) {
    if (block.type !== "tool_use") continue;
    const raw = block.input as Record<string, unknown>;

    // A house number that is not on his list is the one failure mode that
    // would file today's work against somebody else's build. Dropped, never
    // coerced to the nearest number.
    const house = typeof raw.house === "number" ? raw.house : -1;
    const placed = houseNumbers.has(house);

    switch (block.name) {
      case "set_stage": {
        const stage = cleanText(raw.stage, 120);
        if (!placed || !stage || !known.has(stage)) break;
        const status = raw.status;
        if (typeof status !== "string") break;
        if (
          !["not_started", "scheduled", "in_progress", "on_hold", "complete", "not_applicable"].includes(
            status
          )
        )
          break;
        actions.push({ kind: "stage", house, stage, status: status as StageStatus });
        break;
      }

      case "add_private_note": {
        const body = cleanText(raw.body, 4000);
        if (!placed || !body) break;
        actions.push({ kind: "note", house, body });
        break;
      }

      case "draft_owner_update": {
        const body = cleanText(raw.body, 4000);
        if (!placed || !body) break;
        const k = typeof raw.kind === "string" ? raw.kind : "progress";
        const updateKind = (
          ["progress", "delay", "milestone", "weather", "message"].includes(k) ? k : "progress"
        ) as UpdateKind;
        actions.push({ kind: "update", house, body, updateKind });
        break;
      }

      case "set_waiting_on": {
        if (!placed) break;
        actions.push({
          kind: "waiting",
          house,
          waitingOn: cleanText(raw.waitingOn, 200),
          eta: cleanDate(raw.eta),
        });
        break;
      }

      case "set_next_week": {
        const body = cleanText(raw.body, 1000);
        if (!placed || !body) break;
        actions.push({ kind: "next_week", house, body });
        break;
      }

      case "log_wet_day": {
        if (!placed) break;
        actions.push({
          kind: "wet_day",
          house,
          date: cleanDate(raw.date) ?? today,
          note: cleanText(raw.note, 200),
        });
        break;
      }

      case "log_defect": {
        const description = cleanText(raw.description, 2000);
        if (!placed || !description) break;
        actions.push({
          kind: "defect",
          house,
          location: cleanText(raw.location, 120),
          description,
          target: cleanDate(raw.target),
        });
        break;
      }

      case "record_new_house": {
        const address = cleanText(raw.address, 200);
        if (!address) break;
        const owners = Array.isArray(raw.owners)
          ? raw.owners
              .map((o) => {
                const person = o as Record<string, unknown>;
                const name = cleanText(person.name, 120);
                if (!name) return null;
                const email = cleanText(person.email, 200);
                return { name, email: email && email.includes("@") ? email.toLowerCase() : null };
              })
              .filter((o): o is { name: string; email: string | null } => o !== null)
              .slice(0, 2)
          : [];
        const stage = cleanText(raw.currentStage, 120);
        actions.push({
          kind: "house",
          address,
          suburb: cleanText(raw.suburb, 120),
          storeys: raw.storeys === 2 ? 2 : raw.storeys === 1 ? 1 : null,
          owners,
          currentStage: stage && known.has(stage) ? stage : null,
          waitingOn: cleanText(raw.waitingOn, 200),
          handoverFrom: cleanDate(raw.handoverFrom),
          handoverTo: cleanDate(raw.handoverTo),
        });
        break;
      }
    }
  }

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

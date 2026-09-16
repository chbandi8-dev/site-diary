import Anthropic from "@anthropic-ai/sdk";
import { SYDNEY_SUBURBS } from "@/lib/suburbs";

/**
 * Turning "fourteen Wattle Grove, Kellyville, double storey, Priya and Arun,
 * we're on the roof, waiting on windows, handover March April next year" into
 * a filled-in form he can check.
 *
 * This is the counterpart to `lib/draft.ts`. That one rewrites his words for an
 * owner to read; this one reads his words to work out what to put in the
 * database. Both share the same non-negotiable rule: nothing is invented. A
 * field he did not speak about comes back empty, and he fills it in himself.
 *
 * Nothing here writes. It returns a draft, the screen shows it as an editable
 * form, and only his tap saves it — because a mishearing that silently creates
 * a house at the wrong address is far worse than a form he has to correct.
 */

const SYSTEM = `You extract structured details about a house being built from a builder's spoken notes.

The speaker is a residential construction project manager in Sydney. He is
listing houses he runs, quickly and informally, often mid-sentence and out of
order. Your job is to fill in the fields he actually spoke about.

Rules:

1. NEVER invent or infer a value. If he did not say the suburb, leave it empty.
   If he did not mention owners, return none. An empty field is correct and
   expected; a guessed one is a wrong house in his system.
2. Storeys: only set this if he says so ("double storey", "two storey", "single").
   Otherwise leave it empty.
3. currentStage must be copied EXACTLY from the allowed list given to you, or
   left empty. Match on meaning, not wording — "we're on the roof" is the roof
   stage, "brickies are on" is the external walls stage. If you are not
   confident which one he means, leave it empty.
4. Dates: return YYYY-MM-DD. He speaks in months ("handover March, April next
   year") — use the first day of the month for the start of a range and the
   last day for the end. Resolve "next year" against today's date, given below.
   If he gives only one month, set both ends to that month.
5. Owner emails are rarely spoken. If he does not spell one out, leave it empty
   — owners add their own email when they open their link, and a guessed
   address means their updates go to a stranger.
6. waitingOn is what is holding the build up, in his words, shortened to a
   phrase: "the window delivery", "the certifier's sign-off".

DICTATION ERRORS. This arrives from phone dictation, which does not know
Australian place names and mangles them badly. "Wentworthville" comes back as
"went worth ville" or "Wentworth Bill", "Toongabbie" as "tune gabby",
"Baulkham Hills" as "balcom hills", "D'Arcy Road" as "Darcy Road".

Correct these, but only where you are genuinely confident:

 - A suburb that is clearly a mangled version of one in the list below should
   be written as the real name. Judge it on how it SOUNDS, not how it is
   spelled — that is where the error came from.
 - If what he said does not plainly match one of them, keep what he said. A
   wrong suburb confidently written is worse than an odd-looking one he can
   see and fix, and the list is not every suburb in Sydney.
 - Street names cannot be checked against a list. Leave them as heard, except
   for obvious dictation artefacts: spell out numbers spoken as words
   ("fourteen" becomes 14), fix "Rd"/"St" to Road/Street, and apply ordinary
   Australian conventions — an apostrophe in D'Arcy, Mc and Mac capitalised.
 - Where the house list below contains an address that is clearly the same one
   misheard, prefer that spelling exactly. He is describing his own jobs, and
   the same street will be dictated more than once.

Call the record_house tool exactly once.`;

export type HouseDraft = {
  address: string;
  suburb: string | null;
  storeys: 1 | 2 | null;
  owners: { name: string; email: string | null }[];
  currentStage: string | null;
  waitingOn: string | null;
  waitingOnDate: string | null;
  handoverFrom: string | null;
  handoverTo: string | null;
  startDate: string | null;
};

let client: Anthropic | null = null;

function anthropic(): Anthropic {
  if (client) return client;
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY is not set — voice capture is unavailable.");
  }
  client = new Anthropic();
  return client;
}

const TOOL: Anthropic.Tool = {
  name: "record_house",
  description: "Record the house details the builder described. Omit anything he did not say.",
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
          properties: {
            name: { type: "string" },
            email: { type: "string" },
          },
          required: ["name"],
        },
      },
      currentStage: { type: "string", description: "Exactly one name from the allowed list." },
      waitingOn: { type: "string" },
      waitingOnDate: { type: "string", description: "YYYY-MM-DD" },
      handoverFrom: { type: "string", description: "YYYY-MM-DD" },
      handoverTo: { type: "string", description: "YYYY-MM-DD" },
      startDate: { type: "string", description: "YYYY-MM-DD" },
    },
    required: ["address"],
  },
};

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Anything malformed is dropped rather than shown — a bad date in a form he is skimming gets saved. */
function cleanDate(value: unknown): string | null {
  if (typeof value !== "string" || !ISO_DATE.test(value)) return null;
  return Number.isNaN(new Date(`${value}T00:00:00Z`).getTime()) ? null : value;
}

function cleanText(value: unknown, max = 200): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().slice(0, max);
  return trimmed || null;
}

export async function readHouseFromSpeech(opts: {
  transcript: string;
  stageNames: string[];
  /** Addresses already on the books, so a re-dictation matches its spelling. */
  knownAddresses?: string[];
}): Promise<HouseDraft | null> {
  const today = new Date().toISOString().slice(0, 10);

  const response = await anthropic().messages.create({
    model: "claude-opus-5",
    max_tokens: 1500,
    system: SYSTEM,
    // Extraction from a short note. Low effort keeps it quick enough to use
    // standing on a site, which is the only place it will ever be used.
    output_config: { effort: "low" },
    tools: [TOOL],
    tool_choice: { type: "tool", name: "record_house" },
    messages: [
      {
        role: "user",
        content: [
          `Today is ${today}.`,
          ``,
          `Allowed values for currentStage:`,
          opts.stageNames.map((n) => `- ${n}`).join("\n"),
          ``,
          `Sydney suburbs, for correcting dictation:`,
          SYDNEY_SUBURBS.join(", "),
          ``,
          opts.knownAddresses?.length
            ? `Houses already on the books — prefer these spellings if one is clearly the same address:\n${opts.knownAddresses.map((a) => `- ${a}`).join("\n")}\n`
            : ``,
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

  const call = response.content.find(
    (b): b is Anthropic.ToolUseBlock => b.type === "tool_use" && b.name === "record_house"
  );
  if (!call) return null;

  const raw = call.input as Record<string, unknown>;
  const address = cleanText(raw.address);
  if (!address) return null;

  // The stage is checked against the real list rather than trusted. A stage
  // name that does not exist would silently drop the whole "where is this
  // house up to" answer, which is the reason he is dictating in the first place.
  const stage = cleanText(raw.currentStage);
  const currentStage = stage && opts.stageNames.includes(stage) ? stage : null;

  const owners = Array.isArray(raw.owners)
    ? raw.owners
        .map((o) => {
          const person = o as Record<string, unknown>;
          const name = cleanText(person.name, 120);
          if (!name) return null;
          const email = cleanText(person.email, 200);
          return {
            name,
            email: email && email.includes("@") ? email.toLowerCase() : null,
          };
        })
        .filter((o): o is { name: string; email: string | null } => o !== null)
        .slice(0, 2)
    : [];

  return {
    address,
    suburb: cleanText(raw.suburb, 120),
    storeys: raw.storeys === 2 ? 2 : raw.storeys === 1 ? 1 : null,
    owners,
    currentStage,
    waitingOn: cleanText(raw.waitingOn, 200),
    waitingOnDate: cleanDate(raw.waitingOnDate),
    handoverFrom: cleanDate(raw.handoverFrom),
    handoverTo: cleanDate(raw.handoverTo),
    startDate: cleanDate(raw.startDate),
  };
}

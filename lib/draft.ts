import Anthropic from "@anthropic-ai/sdk";

/**
 * Turning what he said into what the owner reads.
 *
 * He talks the way people on a site talk — half sentences, trade shorthand,
 * names, the odd complaint. The owner needs a calm two-line update. That gap
 * is the whole job here, and it is why voice capture is worth more than a
 * dictation box: dictation gets his words onto the screen, this gets them into
 * a form he is willing to send.
 *
 * The rules below are the same ones every seeded template follows, and they
 * exist because a message sent in his name can be quoted back at him:
 * no trade names, no claims he cannot stand behind, no invented dates.
 */

const SYSTEM = `You rewrite a builder's spoken site notes into a short update for the homeowner.

The builder is a residential project manager in Sydney. The reader is the owner of
the house being built — usually anxious, not a builder, and reading on a phone.

Rules, in order of importance:

1. Never invent anything. If he did not say when something will happen, do not
   give a date. If he did not say why, do not guess a reason. Leaving a detail
   out is always better than adding one.
2. Never name a trade's company or an individual. "The bricklayer", never
   "Dave" or "XYZ Bricklaying". It gets back to them.
3. Never state a commitment he did not make. No "on track", no "no delays", no
   "as planned" unless he actually said so. These get quoted back at him.
4. Strip anything that is his business and not theirs — who is annoying him,
   what something costs him, what he suspects. If the note is ONLY that kind of
   content, return the single word: INTERNAL
5. Plain English. No trade abbreviations. "First fix" becomes "the plumber's
   first visit". Two or three sentences, rarely more.
6. Write as him, to them. Warm and direct. Not chirpy, not corporate, no
   exclamation marks, no "we are pleased to".
7. Bad news stays plainly bad news. Do not soften a delay into an
   opportunity — owners forgive delays they were told about straight.

Return only the message. No preamble, no quotes around it, no explanation.`;

let client: Anthropic | null = null;

function anthropic(): Anthropic {
  if (client) return client;
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY is not set — voice drafting is unavailable.");
  }
  client = new Anthropic();
  return client;
}

export type DraftResult = { body: string; internalOnly: boolean };

export async function draftUpdate(opts: {
  transcript: string;
  address: string;
  stages: string[];
}): Promise<DraftResult> {
  const context = [
    `House: ${opts.address}`,
    opts.stages.length ? `Currently underway: ${opts.stages.join(", ")}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  const response = await anthropic().messages.create({
    model: "claude-opus-5",
    max_tokens: 1000,
    system: SYSTEM,
    // A short rewrite — low effort is the right spend, and keeps this fast
    // enough to use while sitting in the ute.
    output_config: { effort: "low" },
    messages: [
      {
        role: "user",
        content: `${context}\n\nWhat he said:\n"""\n${opts.transcript.trim()}\n"""`,
      },
    ],
  });

  const text = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();

  if (!text || text === "INTERNAL") {
    return { body: "", internalOnly: true };
  }

  return { body: text, internalOnly: false };
}

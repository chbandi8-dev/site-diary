import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { readActionsFromSpeech } from "@/lib/assistant";
import { proposeActions } from "@/lib/assistant-propose";
import { z } from "zod";

export const dynamic = "force-dynamic";

/**
 * Interprets a spoken note into a list of actions he can check.
 *
 * Writes nothing — that separation is the whole safety model, and it is worth
 * restating here because this route is the one that would be tempting to
 * shortcut. A mishearing costs him one untick on screen; carried out silently
 * it would cost a stage marked complete on the wrong build, or an email in a
 * homeowner's inbox with his name on it that he never wrote.
 */

const body = z.object({
  transcript: z.string().trim().min(3).max(4000),
  /** The house whose screen he is on, so "the frame's done" needs no address. */
  houseId: z.string().uuid().optional(),
});

export async function POST(req: NextRequest) {
  if (!(await getServerSession(authOptions))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = body.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Say a bit more and try again." }, { status: 400 });
  }

  const [templates, houses] = await Promise.all([
    prisma.stageTemplate.findMany({ select: { name: true }, orderBy: { position: "asc" } }),
    prisma.house.findMany({
      where: { status: { not: "handed_over" } },
      select: {
        id: true,
        address: true,
        suburb: true,
        lotNumber: true,
        development: { select: { name: true } },
        owners: {
          where: { revokedAt: null },
          select: { owner: { select: { id: true, name: true, phone: true } } },
        },
        defects: {
          where: { status: { not: "resolved" } },
          select: { id: true, reference: true, location: true, description: true },
          orderBy: { raisedAt: "asc" },
          take: 40,
        },
      },
      orderBy: { address: "asc" },
      take: 80,
    }),
  ]);

  if (templates.length === 0) {
    return NextResponse.json(
      { error: "No stage templates in the database. Run the seed first." },
      { status: 409 }
    );
  }

  // Numbered, because a UUID is not something a language model should be
  // handling and a bare address is ambiguous the moment two lots share a
  // street. He refers to his own jobs by lot, by street, by suburb or by the
  // owners' names, so all four go in the label.
  // A lot number is only prepended when the address does not already carry it.
  // Plenty of estate jobs are entered as "Lot 114 Carrington Rise" with the lot
  // number filled in as well, and "Lot 114 Lot 114 Carrington Rise" on the
  // approval screen is exactly the kind of sloppiness that makes him stop
  // trusting what the screen says about which house he is about to change.
  const street = (h: (typeof houses)[number]) => {
    if (!h.lotNumber) return h.address;
    // Plain string comparison rather than a regex: lot numbers are free text
    // ("12/1", "3a", "114") and a regex built from one can throw, which would
    // take the whole route down for the sake of a cosmetic prefix.
    const flat = h.address.toLowerCase().replace(/\s+/g, " ");
    const lot = h.lotNumber.toLowerCase().trim();
    const already = flat.includes(`lot ${lot}`) || flat.includes(`lot${lot}`);
    return already ? h.address : `Lot ${h.lotNumber} ${h.address}`;
  };

  /** Everything that might help it place a house. For the model, not the screen. */
  const label = (h: (typeof houses)[number]) => {
    const parts = [street(h)];
    if (h.suburb) parts.push(h.suburb);
    if (h.development) parts.push(h.development.name);
    const names = h.owners.map((o) => o.owner.name).join(" & ");
    if (names) parts.push(names);
    return parts.join(", ");
  };

  /** What he reads on the approval screen: enough to be sure, short enough to fit. */
  const shortLabel = (h: (typeof houses)[number]) =>
    [street(h), h.suburb].filter(Boolean).join(", ");

  const refs = houses.map((h, i) => ({ n: i + 1, label: label(h), stageNames: [] as string[] }));
  const byNumber = new Map(houses.map((h, i) => [i + 1, h]));
  const currentIndex = parsed.data.houseId
    ? houses.findIndex((h) => h.id === parsed.data.houseId)
    : -1;

  let result;
  try {
    result = await readActionsFromSpeech({
      transcript: parsed.data.transcript,
      houses: refs,
      currentHouse: currentIndex === -1 ? null : currentIndex + 1,
      stageNames: templates.map((t) => t.name),
    });
  } catch (cause) {
    const missingKey = cause instanceof Error && cause.message.includes("ANTHROPIC_API_KEY");
    return NextResponse.json(
      {
        error: missingKey
          ? "Voice isn't configured yet — ANTHROPIC_API_KEY is missing. Everything still works by hand."
          : "That didn't come back. Try again, or do it by hand.",
      },
      { status: missingKey ? 503 : 502 }
    );
  }

  const proposed = proposeActions(result.actions, (n) => {
    const h = byNumber.get(n);
    if (!h) return undefined;
    return {
      id: h.id,
      label: shortLabel(h),
      owners: h.owners.map((o) => o.owner),
      openDefects: h.defects,
    };
  });
  const note = [result.note, ...proposed.notes].filter(Boolean).join("\n\n") || null;

  return NextResponse.json({ actions: proposed.actions, note });
}

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { readActionsFromSpeech, type Action } from "@/lib/assistant";
import type { ProposedAction } from "@/lib/assistant-actions";
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

const STATUS_WORDS: Record<string, string> = {
  not_started: "not started",
  scheduled: "scheduled",
  in_progress: "underway",
  on_hold: "on hold",
  complete: "done",
  not_applicable: "not applicable",
};

function shortDate(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

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
          select: { owner: { select: { name: true } } },
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

  const actions: ProposedAction[] = [];

  result.actions.forEach((action: Action, i: number) => {
    const id = `a${i}`;

    if (action.kind === "house") {
      const parts = [action.suburb, action.storeys ? `${action.storeys} storey` : null]
        .filter(Boolean)
        .join(" · ");
      actions.push({
        id,
        title: `Add ${action.address} to the books`,
        houseLabel: parts || "New house",
        bodyField: null,
        bodyLabel: null,
        seenBy: "you",
        footnote: [
          action.owners.length
            ? `Owners: ${action.owners.map((o: { name: string }) => o.name).join(" & ")}`
            : "No owners yet",
          action.currentStage ? `Starting at ${action.currentStage}` : null,
          "All 32 standard stages are copied across",
        ]
          .filter(Boolean)
          .join(" · "),
        payload: {
          kind: "house",
          address: action.address,
          suburb: action.suburb,
          storeys: action.storeys,
          owners: action.owners,
          currentStage: action.currentStage,
          waitingOn: action.waitingOn,
          handoverFrom: action.handoverFrom,
          handoverTo: action.handoverTo,
        },
      });
      return;
    }

    const house = byNumber.get(action.house);
    if (!house) return;
    const houseLabel = shortLabel(house);
    const common = { id, houseLabel };

    switch (action.kind) {
      case "stage":
        actions.push({
          ...common,
          title: `Mark ${action.stage} as ${STATUS_WORDS[action.status] ?? action.status}`,
          bodyField: null,
          bodyLabel: null,
          seenBy: "owners",
          footnote: "Owners see the phase move on their page",
          payload: { kind: "stage", houseId: house.id, stage: action.stage, status: action.status },
        });
        break;

      case "note":
        actions.push({
          ...common,
          title: "Add a private note",
          bodyField: "body",
          bodyLabel: "Your note",
          seenBy: "you",
          footnote: "Owners never see these. Keep it factual — a diary is discoverable in a dispute",
          payload: { kind: "note", houseId: house.id, body: action.body },
        });
        break;

      case "update":
        actions.push({
          ...common,
          title: "Draft an update for the owners",
          bodyField: "body",
          bodyLabel: "What they'll read",
          seenBy: "owners",
          footnote: "Saved unsent. You read it and send it from the house page",
          payload: {
            kind: "update",
            houseId: house.id,
            body: action.body,
            updateKind: action.updateKind,
          },
        });
        break;

      case "waiting":
        actions.push({
          ...common,
          title: action.waitingOn
            ? `Waiting on: ${action.waitingOn}`
            : "Clear what this house is waiting on",
          bodyField: null,
          bodyLabel: null,
          seenBy: "owners",
          footnote: action.eta ? `Expected ${shortDate(action.eta)}` : "No date given",
          payload: {
            kind: "waiting",
            houseId: house.id,
            waitingOn: action.waitingOn,
            eta: action.eta,
          },
        });
        break;

      case "next_week":
        actions.push({
          ...common,
          title: "Set what's happening next week",
          bodyField: "body",
          bodyLabel: "Next week",
          seenBy: "owners",
          footnote: "Goes out with Friday's email",
          payload: { kind: "next_week", houseId: house.id, body: action.body },
        });
        break;

      case "wet_day":
        actions.push({
          ...common,
          title: `Log ${shortDate(action.date)} as a wet day`,
          bodyField: null,
          bodyLabel: null,
          seenBy: "owners",
          footnote: action.note ?? "Counts towards an extension of time",
          payload: { kind: "wet_day", houseId: house.id, date: action.date, note: action.note },
        });
        break;

      case "defect":
        actions.push({
          ...common,
          title: action.location ? `Defect — ${action.location}` : "Add a defect",
          bodyField: "description",
          bodyLabel: "What needs fixing",
          seenBy: "owners",
          footnote: action.target
            ? `Target ${shortDate(action.target)}`
            : "Owners see their defects list",
          payload: {
            kind: "defect",
            houseId: house.id,
            location: action.location,
            description: action.description,
            target: action.target,
          },
        });
        break;
    }
  });

  return NextResponse.json({ actions, note: result.note });
}

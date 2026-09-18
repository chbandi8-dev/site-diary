import { prisma } from "@/lib/prisma";
import { currentPhase, phaseOrder, overdueStages, type StageFacts } from "@/lib/phases";

/**
 * Everything the shared board is allowed to know.
 *
 * The one function the board page may call, and the reason it exists: the
 * people this link goes to are not homeowners. They are the builder he works
 * for, or the developer running the estate. They want to know where the work is
 * up to, and they are entitled to that — but nothing beside it.
 *
 * So what leaves this file is deliberately thin: the address or lot, which
 * phase the work is in, what is underway, and whether the programme is holding.
 * What never leaves is everything that is somebody else's business — owner
 * names, owner emails and phone numbers, contract and variation amounts, the
 * private site diary, defects, photos, and anything an owner wrote. Adding a
 * field here is a decision about whose information it is, not a convenience.
 */

export type BoardRow = {
  id: string;
  /** "Lot 114" inside an estate; the street address otherwise. */
  title: string;
  suburb: string | null;
  estate: string | null;
  phase: string | null;
  underway: string[];
  /** Days past a stage's promised date, or null when nothing is late. */
  behindDays: number | null;
  lastUpdate: string | null;
};

export type Board = {
  estate: string | null;
  rows: BoardRow[];
  phases: string[];
};

export async function readBoard(developmentId: string | null): Promise<Board> {
  const houses = await prisma.house.findMany({
    where: {
      status: { not: "handed_over" },
      ...(developmentId ? { developmentId } : {}),
    },
    select: {
      id: true,
      address: true,
      suburb: true,
      lotNumber: true,
      development: { select: { name: true } },
      stages: {
        select: { phase: true, position: true, status: true, dueBy: true, name: true },
        orderBy: { position: "asc" },
      },
      updates: {
        where: { publishedAt: { not: null }, deletedAt: null },
        select: { occurredAt: true },
        orderBy: { occurredAt: "desc" },
        take: 1,
      },
    },
    orderBy: [{ lotNumber: "asc" }, { address: "asc" }],
  });

  const now = Date.now();

  const rows: BoardRow[] = houses.map((h) => {
    const stages: StageFacts[] = h.stages;
    const late = overdueStages(stages, now);
    // The worst slip, not the count: "eleven days behind" is the number that
    // gets acted on, where "three stages late" invites a follow-up question.
    const behindDays =
      late.length === 0
        ? null
        : Math.max(
            ...late.map((s) => Math.floor((now - (s.dueBy as Date).getTime()) / 86_400_000))
          );

    return {
      id: h.id,
      title: h.lotNumber ? `Lot ${h.lotNumber}` : h.address,
      suburb: h.suburb,
      estate: h.development?.name ?? null,
      phase: currentPhase(stages),
      underway: h.stages.filter((s) => s.status === "in_progress").map((s) => s.name),
      behindDays,
      lastUpdate: h.updates[0]?.occurredAt.toISOString() ?? null,
    };
  });

  return {
    // Only when the board is actually scoped to one. An unscoped board that
    // named the first estate it happened to find would tell a reader they were
    // looking at that estate when they were looking at everything.
    estate: developmentId ? (houses.find((h) => h.development)?.development?.name ?? null) : null,
    rows,
    phases: phaseOrder(houses.flatMap((h) => h.stages)),
  };
}

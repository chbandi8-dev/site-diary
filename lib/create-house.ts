import { prisma } from "@/lib/prisma";

/**
 * Putting a house on the books.
 *
 * Extracted from the add-house route so the voice assistant creates a house by
 * exactly the same path. Two code paths that both "add a house" is how you end
 * up with builds that are subtly different — one with stages copied from the
 * templates, one without — and the difference only shows up months later when
 * an owner's page is empty.
 *
 * Stages are copied from the templates as the CSV importer does it, so a house
 * added by voice, by form or by spreadsheet is indistinguishable afterwards.
 * Everything before the stage he names is marked complete, which is the sane
 * reading of "we're on the roof" and is his to adjust on the board.
 */

export type NewHouse = {
  address: string;
  suburb?: string | null;
  storeys?: 1 | 2;
  owners?: { name: string; email?: string | null; phone?: string | null }[];
  currentStage?: string | null;
  waitingOn?: string | null;
  waitingOnDate?: string | null;
  handoverFrom?: string | null;
  handoverTo?: string | null;
  startDate?: string | null;
};

const day = (value?: string | null) => (value ? new Date(`${value}T00:00:00.000Z`) : null);

export class NoStageTemplates extends Error {
  constructor() {
    super("No stage templates in the database. Run the seed first.");
  }
}

export async function createHouse(input: NewHouse): Promise<{ id: string; address: string }> {
  const templates = await prisma.stageTemplate.findMany({ orderBy: { position: "asc" } });
  if (templates.length === 0) throw new NoStageTemplates();

  const current = input.currentStage
    ? templates.find((t) => t.name === input.currentStage)
    : undefined;
  const furthest = current?.position ?? 0;

  const house = await prisma.house.create({
    data: {
      address: input.address,
      suburb: input.suburb || null,
      storeys: input.storeys ?? 1,
      status: "active",
      waitingOn: input.waitingOn || null,
      waitingOnEta: day(input.waitingOnDate),
      handoverFrom: day(input.handoverFrom),
      handoverTo: day(input.handoverTo),
      startDate: day(input.startDate),
      stages: {
        create: templates.map((t) => ({
          templateId: t.id,
          name: t.name,
          phase: t.phase,
          position: t.position,
          isPaymentMilestone: t.isPaymentMilestone,
          plannedDays: t.typicalDays,
          status:
            current && t.position === current.position
              ? ("in_progress" as const)
              : t.position < furthest
                ? ("complete" as const)
                : t.conditional
                  ? ("not_applicable" as const)
                  : ("not_started" as const),
        })),
      },
    },
    select: { id: true, address: true },
  });

  // A name is enough. He knows who is building the house and often their
  // mobile; he does not know their email, because nobody hands one over at a
  // pre-start meeting. Dropping the name until an address turned up meant the
  // person he had just typed in simply did not appear, and when they later
  // opened their link a second, unrelated record was created beside the one he
  // thought he had made.
  //
  // The email arrives when they register themselves — see `registerViewer`,
  // which attaches it to this record rather than making another. That is also
  // the only version of the address anyone has confirmed.
  for (const person of input.owners ?? []) {
    const email = person.email ? person.email.toLowerCase() : null;

    // Upsert on the address when there is one: the same couple building two
    // houses is one person with two builds. Without an address there is
    // nothing safe to match on, so it is a new record — two different people
    // can share a first name, and merging them would put one family's updates
    // in front of another.
    const owner = email
      ? await prisma.owner.upsert({
          where: { email },
          update: { name: person.name, ...(person.phone ? { phone: person.phone } : {}) },
          create: { name: person.name, email, phone: person.phone ?? null },
        })
      : await prisma.owner.create({
          data: { name: person.name, phone: person.phone ?? null },
        });

    await prisma.houseOwner.upsert({
      where: { houseId_ownerId: { houseId: house.id, ownerId: owner.id } },
      update: { revokedAt: null },
      create: { houseId: house.id, ownerId: owner.id },
    });
  }

  return house;
}

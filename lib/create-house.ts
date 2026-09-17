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
  owners?: { name: string; email?: string | null }[];
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

  // Only owners he gave an address for. An owner record exists to be emailed,
  // and the product's whole shape is that they register themselves when they
  // open the WhatsApp link — so a name with no address is not a half-owner
  // worth storing, it is a row that would sit there looking like contact
  // details he has.
  for (const person of input.owners ?? []) {
    if (!person.email) continue;
    const email = person.email.toLowerCase();

    // Upsert rather than create: the same couple building two houses is one
    // person with two builds, and they should not have to register twice.
    const owner = await prisma.owner.upsert({
      where: { email },
      update: { name: person.name },
      create: { name: person.name, email },
    });

    await prisma.houseOwner.upsert({
      where: { houseId_ownerId: { houseId: house.id, ownerId: owner.id } },
      update: { revokedAt: null },
      create: { houseId: house.id, ownerId: owner.id },
    });
  }

  return house;
}

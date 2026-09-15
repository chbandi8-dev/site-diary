import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

export const dynamic = "force-dynamic";

/**
 * Adding a house.
 *
 * Until now this only existed as a CSV import script, which is fine for the
 * first twenty-five and useless for the twenty-sixth — he is not opening a
 * terminal to add the job he won this morning.
 *
 * Stages are copied from the templates exactly as the importer does it, so a
 * house added here and a house added from the spreadsheet are indistinguishable
 * afterwards. Everything before the stage he names is marked complete, which is
 * the sane reading of "we're on the roof" and is his to adjust on the board.
 */

const create = z.object({
  address: z.string().trim().min(3).max(200),
  suburb: z.string().trim().max(120).optional().nullable(),
  storeys: z.union([z.literal(1), z.literal(2)]).default(1),
  owners: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(120),
        email: z.string().trim().email().max(200).optional().nullable(),
      })
    )
    .max(2)
    .default([]),
  currentStage: z.string().trim().max(120).optional().nullable(),
  waitingOn: z.string().trim().max(200).optional().nullable(),
  waitingOnDate: z.string().date().optional().nullable(),
  handoverFrom: z.string().date().optional().nullable(),
  handoverTo: z.string().date().optional().nullable(),
  startDate: z.string().date().optional().nullable(),
});

const day = (value?: string | null) => (value ? new Date(`${value}T00:00:00.000Z`) : null);

export async function POST(req: NextRequest) {
  if (!(await getServerSession(authOptions))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = create.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Check the details and try again." }, { status: 400 });
  }
  const input = parsed.data;

  const templates = await prisma.stageTemplate.findMany({ orderBy: { position: "asc" } });
  if (templates.length === 0) {
    return NextResponse.json(
      { error: "No stage templates in the database. Run the seed first." },
      { status: 409 }
    );
  }

  const current = input.currentStage
    ? templates.find((t) => t.name === input.currentStage)
    : undefined;
  const furthest = current?.position ?? 0;

  const house = await prisma.house.create({
    data: {
      address: input.address,
      suburb: input.suburb || null,
      storeys: input.storeys,
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
          status: current && t.position === current.position
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
  // details he has. The form says this in as many words.
  for (const person of input.owners) {
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

  return NextResponse.json(house, { status: 201 });
}

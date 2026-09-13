import { PrismaClient } from "@prisma/client";

/**
 * The build spine for a detached single or double storey house, NSW.
 *
 * Two things this list gets right that a naive fourteen-step version does not:
 *
 * 1. It is granular underneath and rolled up for owners. He needs this detail
 *    for claims and for evidence; an owner needs eight or nine phases. The
 *    `phase` column does the rollup.
 *
 * 2. It does not pretend the build is linear. Stages legitimately run at the
 *    same time — brickwork while the roof is tiled, painting upstairs while
 *    tiling finishes down — and they stall and resume rather than completing
 *    cleanly. `position` orders them for display; it does not mean only one is
 *    active. Never render this as "stage 6 of 31", and never derive a
 *    percentage from position: lock-up is roughly a third of the program by
 *    time, not half. Weight by `typicalDays`.
 *
 * Stages marked `conditional` default to not_applicable — no demolition on a
 * vacant block, no piering on stable soil, owner-supplied landscaping.
 *
 * The claim milestones (deposit, base, frame, lock-up, fixing, final) match
 * standard HIA/MBA fixed-price residential contracts. They are flagged here for
 * convenience, but the contractual claim itself lives in ClaimMilestone — a
 * stage tap must never be what moves an invoice.
 */

const STAGES: {
  name: string;
  phase: string;
  days?: number;
  claim?: boolean;
  conditional?: boolean;
}[] = [
  // The three to nine months owners find hardest: nothing to photograph, and
  // no information. Most builders start their portal after this. That is
  // precisely backwards.
  { name: "Contract & deposit", phase: "Before we start", days: 5, claim: true },
  { name: "Selections & colours", phase: "Before we start", days: 20 },
  { name: "Soil test, survey & engineering", phase: "Before we start", days: 15 },
  { name: "Plans & development approval", phase: "Before we start", days: 45 },
  { name: "Construction certificate, insurance & permits", phase: "Before we start", days: 20 },
  { name: "Site handover & pre-start meeting", phase: "Before we start", days: 2 },

  { name: "Demolition & service disconnection", phase: "Site works", days: 10, conditional: true },
  { name: "Site establishment & set-out", phase: "Site works", days: 3 },
  { name: "Earthworks, piering & retaining", phase: "Site works", days: 8, conditional: true },

  { name: "Under-slab plumbing & drainage", phase: "Foundations", days: 4 },
  { name: "Footings & slab", phase: "Foundations", days: 10, claim: true },

  { name: "Frame", phase: "Frame & roof", days: 12, claim: true },
  { name: "Roof", phase: "Frame & roof", days: 8 },

  // The most visible change of the entire build — the owner drives past and a
  // house has appeared. Absent from most stage lists.
  { name: "External walls: brick, cladding or render", phase: "Enclosing the house", days: 20 },
  { name: "Windows & external doors", phase: "Enclosing the house", days: 4, claim: true },

  { name: "Rough-ins: plumbing, electrical & HVAC", phase: "Inside the walls", days: 10 },
  { name: "Wet-area waterproofing", phase: "Inside the walls", days: 3 },
  { name: "Insulation & internal linings", phase: "Inside the walls", days: 12 },

  { name: "Tiling", phase: "Fit-out", days: 10 },
  { name: "Fix-out carpentry", phase: "Fit-out", days: 12 },
  // Stone templating is a classic program breaker: the benchtop can't be
  // measured until the cabinets are in, then it's a fortnight at the factory.
  { name: "Cabinetry & stone", phase: "Fit-out", days: 20, claim: true },
  { name: "Painting", phase: "Fit-out", days: 12 },
  { name: "Fit-off: plumbing, electrical & appliances", phase: "Fit-out", days: 8 },

  { name: "Driveway, paths & stormwater", phase: "Outside & finishing", days: 8 },
  { name: "Fencing & landscaping", phase: "Outside & finishing", days: 10, conditional: true },
  { name: "Final clean & builder's defect sweep", phase: "Outside & finishing", days: 4 },

  { name: "Compliance certificates", phase: "Handover", days: 10 },
  // The actual legal gate. "Finished but you can't move in yet" is the classic
  // late-stage surprise, and it is entirely avoidable with a visible status.
  { name: "Occupation certificate", phase: "Handover", days: 10 },
  { name: "Pre-handover inspection & defects list", phase: "Handover", days: 5 },
  { name: "Rectification", phase: "Handover", days: 15 },
  { name: "Handover & keys", phase: "Handover", days: 1, claim: true },

  // The portal must not go dark here. The weeks after handover — owner has
  // paid, holds a forty-item list, and every builder goes quiet — are where the
  // relationship is saved or lost, and where the referral comes from.
  { name: "Defects liability period", phase: "After handover", days: 90 },
];

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export async function seedStages(prisma: PrismaClient) {
  for (const [i, stage] of STAGES.entries()) {
    const slug = slugify(stage.name);
    await prisma.stageTemplate.upsert({
      where: { slug },
      update: {
        name: stage.name,
        phase: stage.phase,
        position: i + 1,
        isPaymentMilestone: stage.claim ?? false,
        conditional: stage.conditional ?? false,
        typicalDays: stage.days,
      },
      create: {
        name: stage.name,
        slug,
        phase: stage.phase,
        position: i + 1,
        isPaymentMilestone: stage.claim ?? false,
        conditional: stage.conditional ?? false,
        typicalDays: stage.days,
      },
    });
  }
  console.log(`✓ ${STAGES.length} stage templates seeded`);
}

if (require.main === module) {
  const prisma = new PrismaClient();
  seedStages(prisma)
    .then(() => prisma.$disconnect())
    .catch(async (e) => {
      console.error(e);
      await prisma.$disconnect();
      process.exit(1);
    });
}

import { PrismaClient } from "@prisma/client";
import { issueHouseLink } from "../lib/owner/session";

/**
 * Example data, so the site can be walked through before any real build is in it.
 *
 * Everything here is invented — the addresses, the owners, the dates. Nothing
 * corresponds to a real person or property. Clear it before the first real
 * house goes in:
 *
 *   npx ts-node prisma/seed-demo.ts --clear
 *
 * Owners seeded here have no Supabase auth account, so nobody can sign in as
 * them. To try the owner portal, invite one of these addresses in Supabase Auth
 * and sign in with the code.
 */

const DEMO_TAG = "demo.invalid";

type DemoUpdate = { daysAgo: number; kind?: string; body: string };

const HOUSES: {
  address: string;
  suburb: string;
  storeys: number;
  owners: { name: string; email: string }[];
  completedThrough: number;
  active: string[];
  waitingOn?: string;
  waitingOnDays?: number;
  handoverFrom: string;
  handoverTo: string;
  updates: DemoUpdate[];
  report?: { kind: string; body: string; replied?: string };
  variations?: { description: string; amount: number; decided?: "approved" | "declined" }[];
  wetDays?: { daysAgo: number; note: string }[];
}[] = [
  {
    address: "14 Wattle Grove",
    suburb: "Kellyville",
    storeys: 2,
    owners: [
      { name: "Priya Raman", email: `priya@${DEMO_TAG}` },
      { name: "Arun Raman", email: `arun@${DEMO_TAG}` },
    ],
    completedThrough: 13,
    active: ["Roof", "External walls: brick, cladding or render"],
    waitingOn: "the window delivery",
    waitingOnDays: 4,
    handoverFrom: "2027-03-01",
    handoverTo: "2027-04-30",
    updates: [
      { daysAgo: 1, body: "The bricklayer was on site today and work is moving along as planned." },
      {
        daysAgo: 3,
        kind: "milestone",
        body:
          "The roof is on and your house is watertight. Everything inside can now get underway.",
      },
      { daysAgo: 6, kind: "weather", body: "Too wet to work on site today, so the crew stood down. We log the days we lose to weather so you can see exactly where the time goes." },
      { daysAgo: 9, body: "Your roof tiles arrived on site today and have been checked over." },
      { daysAgo: 14, kind: "milestone", body: "The frame is up. This is the one everyone waits for — you can walk through and stand in your actual rooms for the first time." },
    ],
    report: {
      kind: "question",
      body:
        "There's a gap under the window opening in the photo from Tuesday — is that meant to be there?",
    },
    variations: [
      {
        description:
          "Extra double power point and data point to the study, as discussed on site.",
        amount: 480,
      },
      {
        description: "Upgrade to the taller kitchen overhead cupboards.",
        amount: 1250,
        decided: "approved",
      },
    ],
    wetDays: [
      { daysAgo: 6, note: "Rained out — no bricklaying" },
      { daysAgo: 7, note: "Site too soft for the scaffold truck" },
    ],
  },
  {
    address: "7 Ironbark Close",
    suburb: "Box Hill",
    storeys: 1,
    owners: [{ name: "Megan Doyle", email: `megan@${DEMO_TAG}` }],
    completedThrough: 11,
    active: ["Frame"],
    handoverFrom: "2027-05-01",
    handoverTo: "2027-06-30",
    updates: [
      { daysAgo: 2, body: "The carpenter was on site today and work is moving along as planned." },
      { daysAgo: 5, kind: "milestone", body: "Your slab went down today. It needs a few days to cure before the frame can start — this is the first time the footprint of your house is really visible on the block." },
      { daysAgo: 12, body: "No work on site today. Next up is the concrete pour, and your dates haven't changed." },
    ],
  },
  {
    address: "22 Paperbark Rise",
    suburb: "Rouse Hill",
    storeys: 2,
    owners: [{ name: "Tom Whitfield", email: `tom@${DEMO_TAG}` }],
    completedThrough: 6,
    active: ["Site establishment & set-out"],
    waitingOn: "the certifier's sign-off",
    waitingOnDays: 9,
    handoverFrom: "2027-08-01",
    handoverTo: "2027-09-30",
    updates: [
      {
        daysAgo: 4,
        kind: "delay",
        body:
          "We're waiting on the certifier's sign-off before the next stage can start. This one is out of my hands, but I'm following it up and will update you as soon as I hear.",
      },
      { daysAgo: 11, body: "Site fencing, the toilet and the bin are in, and the block has been set out ready for excavation." },
    ],
    variations: [
      {
        description: "Additional tap point to the rear of the garage.",
        amount: 320,
        decided: "declined",
      },
    ],
    wetDays: [{ daysAgo: 15, note: "Excavation stood down — too wet to dig" }],
  },
  {
    address: "3 Casuarina Way",
    suburb: "Riverstone",
    storeys: 1,
    owners: [{ name: "Sandra Oyelaran", email: `sandra@${DEMO_TAG}` }],
    completedThrough: 27,
    active: ["Rectification"],
    handoverFrom: "2026-10-01",
    handoverTo: "2026-10-31",
    updates: [
      { daysAgo: 2, body: "Working through the list from our walk-through. Six of the eleven items are done." },
      { daysAgo: 8, kind: "milestone", body: "Your house has reached practical completion. Next is our walk-through together, where we go room by room and list anything that needs attention before handover." },
    ],
    report: {
      kind: "maintenance",
      body: "The back door sticks a bit when it's been raining.",
      replied:
        "Good pick-up — that's the timber swelling slightly while it settles. The carpenter is back on Thursday and will plane and re-seal the edge. Nothing structural.",
    },
  },
];

async function clear(prisma: PrismaClient) {
  const owners = await prisma.owner.findMany({
    where: { email: { endsWith: DEMO_TAG } },
    select: { id: true, houses: { select: { houseId: true } } },
  });
  const houseIds = Array.from(new Set(owners.flatMap((o) => o.houses.map((h) => h.houseId))));

  await prisma.house.deleteMany({ where: { id: { in: houseIds } } });
  await prisma.owner.deleteMany({ where: { email: { endsWith: DEMO_TAG } } });
  console.log(`✓ Removed ${houseIds.length} example house(s)`);
}

export async function seedDemo(prisma: PrismaClient) {
  const templates = await prisma.stageTemplate.findMany({ orderBy: { position: "asc" } });
  if (templates.length === 0) {
    throw new Error("Run the stage template seed first — example houses copy their stages from it.");
  }

  const staff = await prisma.user.findFirst({ where: { role: "admin" }, select: { id: true } });
  if (!staff) throw new Error("Seed the admin user first.");

  const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000);

  for (const spec of HOUSES) {
    const house = await prisma.house.create({
      data: {
        address: spec.address,
        suburb: spec.suburb,
        storeys: spec.storeys,
        status: spec.completedThrough >= 26 ? "practical_completion" : "active",
        waitingOn: spec.waitingOn,
        waitingOnEta: spec.waitingOnDays ? daysAgo(-spec.waitingOnDays) : null,
        handoverFrom: new Date(spec.handoverFrom),
        handoverTo: new Date(spec.handoverTo),
      },
    });

    for (const owner of spec.owners) {
      const record = await prisma.owner.upsert({
        where: { email: owner.email },
        update: {},
        create: { name: owner.name, email: owner.email, registeredAt: new Date() },
      });
      await prisma.houseOwner.create({ data: { houseId: house.id, ownerId: record.id } });
    }

    await prisma.houseStage.createMany({
      data: templates.map((t, i) => ({
        houseId: house.id,
        templateId: t.id,
        name: t.name,
        phase: t.phase,
        position: t.position,
        isPaymentMilestone: t.isPaymentMilestone,
        plannedDays: t.typicalDays,
        status: spec.active.includes(t.name)
          ? ("in_progress" as const)
          : i < spec.completedThrough
            ? ("complete" as const)
            : ("not_started" as const),
        completedAt: i < spec.completedThrough ? daysAgo(90 - i * 3) : null,
      })),
    });

    for (const u of spec.updates) {
      await prisma.update.create({
        data: {
          houseId: house.id,
          kind: (u.kind ?? "progress") as "progress",
          body: u.body,
          authorId: staff.id,
          occurredAt: daysAgo(u.daysAgo),
          publishedAt: daysAgo(u.daysAgo),
          publishedById: staff.id,
        },
      });
    }

    if (spec.report) {
      const owner = await prisma.owner.findUniqueOrThrow({
        where: { email: spec.owners[0].email },
        select: { id: true },
      });
      await prisma.ownerReport.create({
        data: {
          houseId: house.id,
          ownerId: owner.id,
          kind: spec.report.kind as "question",
          body: spec.report.body,
          createdAt: daysAgo(2),
          ...(spec.report.replied
            ? {
                status: "resolved" as const,
                acknowledgedAt: daysAgo(2),
                replyBody: spec.report.replied,
                repliedAt: daysAgo(1),
                repliedById: staff.id,
                resolvedAt: daysAgo(1),
              }
            : {}),
        },
      });
    }

    // Variations are seeded already sent, never as drafts — a draft is
    // invisible to the owner, so it would demonstrate nothing on the page this
    // data exists to show.
    if (spec.variations?.length) {
      const first = await prisma.owner.findUniqueOrThrow({
        where: { email: spec.owners[0].email },
        select: { id: true },
      });

      for (let i = 0; i < spec.variations.length; i++) {
        const v = spec.variations[i];
        await prisma.variation.create({
          data: {
            houseId: house.id,
            reference: `VO-${String(i + 1).padStart(2, "0")}`,
            description: v.description,
            amountCents: Math.round(v.amount * 100),
            status: v.decided ?? "sent",
            sentAt: daysAgo(5),
            ...(v.decided === "approved"
              ? { approvedAt: daysAgo(4), approvedById: first.id }
              : {}),
            ...(v.decided === "declined"
              ? {
                  declinedAt: daysAgo(4),
                  approvedById: first.id,
                  declineReason: "We'll do this ourselves after handover.",
                }
              : {}),
          },
        });
      }
    }

    if (spec.wetDays?.length) {
      for (const w of spec.wetDays) {
        const date = daysAgo(w.daysAgo);
        await prisma.weatherDay.create({
          data: {
            houseId: house.id,
            // Date-only column: normalising to UTC midnight keeps the unique
            // constraint doing its job instead of admitting the same day twice.
            date: new Date(date.toISOString().slice(0, 10)),
            workLost: true,
            note: w.note,
            source: "pm",
          },
        });
      }
    }
  }

  console.log(`\n✓ ${HOUSES.length} example houses seeded (emails end in @${DEMO_TAG})\n`);
  console.log("Owner links — open any of these to see what a homeowner sees:\n");
  for (const spec of HOUSES) {
    const house = await prisma.house.findFirstOrThrow({
      where: { address: spec.address },
      select: { id: true },
    });
    const token = await issueHouseLink(house.id);
    console.log(`  ${spec.address}`);
    console.log(`  ${process.env.NEXTAUTH_URL ?? "http://localhost:3000"}/h/${token}\n`);
  }
}

if (require.main === module) {
  const prisma = new PrismaClient();
  const run = process.argv.includes("--clear") ? clear : seedDemo;
  run(prisma)
    .then(() => prisma.$disconnect())
    .catch(async (e) => {
      console.error(e);
      await prisma.$disconnect();
      process.exit(1);
    });
}

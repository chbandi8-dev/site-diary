import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/**
 * Two example houses, added from the app.
 *
 * The seed script needs a terminal, which is no use to someone running this
 * from a phone — and an empty system demonstrates nothing. These two are built
 * to exercise the parts that are invisible until there is data behind them: a
 * house mid-build with an owner waiting on an answer, and one at handover with
 * a defects list half worked through.
 *
 * Recognisable and removable by construction. Every owner is on @example.invalid
 * — a reserved domain that cannot receive mail — so nothing here can email a
 * real person, and clearing them is a single query rather than a judgement call
 * about which houses were real.
 */

const DEMO_DOMAIN = "example.invalid";

const HOUSES = [
  {
    address: "14 Wattle Grove",
    suburb: "Kellyville",
    storeys: 2,
    completedThrough: "Roof",
    active: "External walls: brick, cladding or render",
    waitingOn: "the window delivery",
    waitingOnDays: 4,
    startedDaysAgo: 190,
    handoverFrom: 150,
    handoverTo: 210,
    owners: [
      { name: "Priya Raman", email: `priya@${DEMO_DOMAIN}` },
      { name: "Arun Raman", email: `arun@${DEMO_DOMAIN}` },
    ],
    updates: [
      { daysAgo: 1, kind: "progress", body: "The bricklayer was on site today and the front elevation is about half done." },
      { daysAgo: 3, kind: "milestone", body: "The roof is on and your house is watertight. Everything inside can get underway now." },
      { daysAgo: 6, kind: "weather", body: "Too wet to work today, so the crew stood down. We log the days we lose to weather so you can see exactly where the time goes." },
      { daysAgo: 14, kind: "milestone", body: "The frame is up. This is the one everyone waits for — you can walk through and stand in your actual rooms for the first time." },
    ],
    decision: {
      question: "Bathroom tile selection",
      consequence: "Tiling can't be booked until these are chosen.",
      dueInDays: 5,
    },
    variation: {
      description: "Extra double power point and data point to the study, as discussed on site.",
      amount: 480,
    },
    wetDays: [
      { daysAgo: 6, note: "Rained out — no bricklaying" },
      { daysAgo: 7, note: "Site too soft for the scaffold truck" },
    ],
    report: {
      body: "There's a gap under the window opening in the photo from Tuesday — is that meant to be there?",
    },
  },
  {
    address: "3 Casuarina Way",
    suburb: "Riverstone",
    storeys: 1,
    completedThrough: "Pre-handover inspection & defects list",
    active: "Rectification",
    waitingOn: null,
    waitingOnDays: null,
    startedDaysAgo: 400,
    handoverFrom: 20,
    handoverTo: 45,
    owners: [{ name: "Sandra Oyelaran", email: `sandra@${DEMO_DOMAIN}` }],
    updates: [
      { daysAgo: 2, kind: "progress", body: "Working through the list from our walk-through. Six of the eleven items are done." },
      { daysAgo: 8, kind: "milestone", body: "Your house has reached practical completion. Next is our walk-through together, where we go room by room and list anything needing attention before handover." },
    ],
    decision: null,
    variation: null,
    wetDays: [],
    report: null,
    defects: [
      { location: "Kitchen", description: "Cabinet door beside the oven doesn't sit flush.", owner: true, done: true },
      { location: "Main bathroom", description: "Silicone bead along the bath needs redoing.", owner: true, done: true },
      { location: "Hallway", description: "Scuff on the architrave beside the linen cupboard.", owner: false, done: true },
      { location: "Bed 2", description: "Window winder stiff.", owner: true, done: false },
      { location: "External", description: "Downpipe bracket loose at the rear corner.", owner: false, done: false },
    ],
  },
];

const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000);
const dayOnly = (n: number) => new Date(daysAgo(n).toISOString().slice(0, 10));

export async function POST() {
  const session = await getServerSession(authOptions);
  const staffId = (session?.user as { id?: string } | undefined)?.id;
  if (!staffId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const templates = await prisma.stageTemplate.findMany({ orderBy: { position: "asc" } });
  if (templates.length === 0) {
    return NextResponse.json(
      { error: "No stage templates yet. The database seed hasn't run." },
      { status: 409 }
    );
  }

  const created: string[] = [];

  for (const spec of HOUSES) {
    // Skip rather than duplicate, so tapping the button twice is harmless.
    const existing = await prisma.house.findFirst({
      where: { address: spec.address },
      select: { id: true },
    });
    if (existing) continue;

    const through = templates.find((t) => t.name === spec.completedThrough);
    const current = templates.find((t) => t.name === spec.active);
    const furthest = through?.position ?? 0;

    const house = await prisma.house.create({
      data: {
        address: spec.address,
        suburb: spec.suburb,
        storeys: spec.storeys,
        status: "active",
        waitingOn: spec.waitingOn,
        waitingOnEta: spec.waitingOnDays ? daysAgo(-spec.waitingOnDays) : null,
        startDate: dayOnly(spec.startedDaysAgo),
        handoverFrom: dayOnly(-spec.handoverFrom),
        handoverTo: dayOnly(-spec.handoverTo),
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
                : t.position <= furthest
                  ? ("complete" as const)
                  : t.conditional
                    ? ("not_applicable" as const)
                    : ("not_started" as const),
            completedAt: t.position <= furthest ? daysAgo(spec.startedDaysAgo - t.position * 4) : null,
          })),
        },
      },
      select: { id: true, address: true },
    });

    const ownerIds: string[] = [];
    for (const person of spec.owners) {
      const owner = await prisma.owner.upsert({
        where: { email: person.email },
        update: { name: person.name },
        create: { name: person.name, email: person.email, registeredAt: new Date() },
      });
      await prisma.houseOwner.create({ data: { houseId: house.id, ownerId: owner.id } });
      ownerIds.push(owner.id);
    }

    for (const u of spec.updates) {
      await prisma.update.create({
        data: {
          houseId: house.id,
          kind: u.kind as "progress",
          body: u.body,
          authorId: staffId,
          occurredAt: daysAgo(u.daysAgo),
          publishedAt: daysAgo(u.daysAgo),
          publishedById: staffId,
        },
      });
    }

    if (spec.decision) {
      await prisma.decision.create({
        data: {
          houseId: house.id,
          question: spec.decision.question,
          consequence: spec.decision.consequence,
          dueDate: dayOnly(-spec.decision.dueInDays),
          askedAt: daysAgo(6),
        },
      });
    }

    if (spec.variation) {
      await prisma.variation.create({
        data: {
          houseId: house.id,
          reference: "VO-01",
          description: spec.variation.description,
          amountCents: Math.round(spec.variation.amount * 100),
          status: "sent",
          sentAt: daysAgo(5),
        },
      });
    }

    for (const w of spec.wetDays) {
      await prisma.weatherDay.create({
        data: {
          houseId: house.id,
          date: dayOnly(w.daysAgo),
          workLost: true,
          note: w.note,
          source: "pm",
        },
      });
    }

    if (spec.report && ownerIds[0]) {
      await prisma.ownerReport.create({
        data: {
          houseId: house.id,
          ownerId: ownerIds[0],
          kind: "question",
          body: spec.report.body,
          createdAt: daysAgo(1),
        },
      });
    }

    const defects = spec.defects ?? [];
    for (let i = 0; i < defects.length; i++) {
      const d = defects[i];
      await prisma.defect.create({
        data: {
          houseId: house.id,
          reference: String(i + 1),
          location: d.location,
          description: d.description,
          raisedByOwner: d.owner,
          status: d.done ? "resolved" : "open",
          raisedAt: daysAgo(8),
          resolvedAt: d.done ? daysAgo(3) : null,
        },
      });
    }

    created.push(house.address);
  }

  return NextResponse.json({ created });
}

/**
 * Clears them again, found by the reserved owner domain rather than by address,
 * so a real house that happens to share a street name is never touched.
 */
export async function DELETE(req: NextRequest) {
  if (!(await getServerSession(authOptions))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const owners = await prisma.owner.findMany({
    where: { email: { endsWith: DEMO_DOMAIN } },
    select: { id: true, houses: { select: { houseId: true } } },
  });

  const houseIds = Array.from(new Set(owners.flatMap((o) => o.houses.map((h) => h.houseId))));
  await prisma.house.deleteMany({ where: { id: { in: houseIds } } });
  await prisma.owner.deleteMany({ where: { email: { endsWith: DEMO_DOMAIN } } });

  return NextResponse.json({ removed: houseIds.length });
}

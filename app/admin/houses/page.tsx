import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/auth-guard";
import AddHouse from "@/components/admin/AddHouse";
import HouseList from "@/components/admin/HouseList";
import DemoHouses, { ExportEverything } from "@/components/admin/DemoHouses";

export const dynamic = "force-dynamic";

const DAYS_QUIET_BEFORE_FLAG = 5;

/**
 * The run sheet. Ordered so the houses that need him are at the top — a house
 * going quiet is the leading indicator of an owner about to ring.
 */
export default async function HousesPage() {
  await requireStaff();
  const stageNames = (
    await prisma.stageTemplate.findMany({
      select: { name: true },
      orderBy: { position: "asc" },
    })
  ).map((t) => t.name);

  const houses = await prisma.house.findMany({
    where: { status: { not: "handed_over" } },
    select: {
      id: true,
      address: true,
      suburb: true,
      waitingOn: true,
      stages: {
        where: { status: "in_progress" },
        select: { name: true },
        orderBy: { position: "asc" },
      },
      updates: {
        where: { publishedAt: { not: null } },
        select: { occurredAt: true },
        orderBy: { occurredAt: "desc" },
        take: 1,
      },
      _count: {
        select: {
          ownerReports: { where: { status: "submitted" } },
          updates: { where: { publishedAt: null, deletedAt: null } },
        },
      },
    },
    orderBy: { address: "asc" },
  });

  const demoPresent =
    (await prisma.owner.count({ where: { email: { endsWith: "example.invalid" } } })) > 0;

  const now = Date.now();
  const withState = houses.map((h) => {
    const last = h.updates[0]?.occurredAt;
    const daysQuiet = last
      ? Math.floor((now - last.getTime()) / 86_400_000)
      : Number.POSITIVE_INFINITY;
    return {
      ...h,
      daysQuiet,
      needsAttention:
        daysQuiet >= DAYS_QUIET_BEFORE_FLAG ||
        h._count.ownerReports > 0 ||
        h._count.updates > 0,
    };
  });

  withState.sort((a, b) => Number(b.needsAttention) - Number(a.needsAttention));

  return (
    <div>
      <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl text-white">Houses</h1>
          <p className="mt-1 text-white/50">
            {withState.filter((h) => h.needsAttention).length} need something · {withState.length} active
          </p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <AddHouse stageNames={stageNames} />
          <div className="flex items-center gap-4">
            <Link
              href="/admin/trades"
              className="text-sm text-white/45 underline underline-offset-4 hover:text-white"
            >
              Trades
            </Link>
            <Link
              href="/admin/stages"
              className="text-sm text-white/45 underline underline-offset-4 hover:text-white"
            >
              Standard stages
            </Link>
          </div>
        </div>
      </header>

      <HouseList
        rows={withState.map((h) => ({
          id: h.id,
          address: h.address,
          suburb: h.suburb,
          underway: h.stages.map((s) => s.name),
          waitingOn: h.waitingOn,
          // Infinity does not survive the trip to a client component, so a
          // house that has never been updated travels as -1 rather than as a
          // very large number that would render as "9007199254740991d".
          daysQuiet: Number.isFinite(h.daysQuiet) ? h.daysQuiet : -1,
          reports: h._count.ownerReports,
          drafts: h._count.updates,
          needsAttention: h.needsAttention,
        }))}
      />

      {withState.length === 0 && (
        <p className="rounded-lg border border-white/5 bg-dark-card px-5 py-8 text-center text-white/45">
          No houses yet. Add one by talking to it, or drop in the examples below to
          see how it all works first.
        </p>
      )}

      <DemoHouses present={demoPresent} />

      <ExportEverything />
    </div>
  );
}

import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/auth-guard";
import AddHouse from "@/components/admin/AddHouse";
import HouseList from "@/components/admin/HouseList";
import DemoHouses, { ExportEverything } from "@/components/admin/DemoHouses";
import { currentPhase, hasProgramme, overdueStages, type StageFacts } from "@/lib/phases";
import { X } from "lucide-react";

export const dynamic = "force-dynamic";

const DAYS_QUIET_BEFORE_FLAG = 5;

/**
 * The run sheet. Ordered so the houses that need him are at the top — a house
 * going quiet is the leading indicator of an owner about to ring.
 */
export default async function HousesPage({
  searchParams,
}: {
  searchParams?: { phase?: string; behind?: string };
}) {
  await requireStaff();

  // The dashboard's bars and its "slipping" tile both land here. A link that
  // dumps him back on the full run sheet is the same as no link at all, so the
  // two cuts it can make are honoured, and only then is the extra query paid
  // for — the unfiltered run sheet stays exactly as cheap as it was.
  const phaseFilter = searchParams?.phase?.trim() || null;
  const behindOnly = searchParams?.behind === "1";

  // Three independent queries, run at once. In series they were three round
  // trips to the database stacked end to end before a single pixel of the run
  // sheet could render, on the page he opens more than any other.
  const [templates, houses, demoPresent] = await Promise.all([
    prisma.stageTemplate.findMany({
      select: { name: true },
      orderBy: { position: "asc" },
    }),
    prisma.house.findMany({
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
    }),
    prisma.owner.count({ where: { email: { endsWith: "example.invalid" } } }).then((n) => n > 0),
  ]);

  const stageNames = templates.map((t) => t.name);

  let matching: Set<string> | null = null;
  if (phaseFilter || behindOnly) {
    const rows = await prisma.houseStage.findMany({
      where: { house: { status: { not: "handed_over" } } },
      select: { houseId: true, phase: true, position: true, status: true, dueBy: true },
      orderBy: { position: "asc" },
    });
    const byHouse = new Map<string, StageFacts[]>();
    for (const r of rows) {
      const list = byHouse.get(r.houseId) ?? [];
      list.push(r);
      byHouse.set(r.houseId, list);
    }
    matching = new Set(
      houses
        .filter((h) => {
          const stages = byHouse.get(h.id) ?? [];
          if (phaseFilter && currentPhase(stages) !== phaseFilter) return false;
          if (behindOnly && !(hasProgramme(stages) && overdueStages(stages).length > 0))
            return false;
          return true;
        })
        .map((h) => h.id)
    );
  }

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

  const shown = matching ? withState.filter((h) => matching.has(h.id)) : withState;
  const filterLabel = phaseFilter
    ? `In ${phaseFilter}`
    : behindOnly
      ? "Behind their dates"
      : null;

  return (
    <div>
      <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl text-white">Houses</h1>
          <p className="mt-1 text-white/50">
            {shown.filter((h) => h.needsAttention).length} need something · {shown.length}
            {filterLabel ? " shown" : " active"}
          </p>
          {filterLabel && (
            <Link
              href="/admin/houses"
              className="mt-2 inline-flex min-h-[36px] items-center gap-2 rounded-full border border-gold/30 bg-gold/[0.08] pl-3.5 pr-3 text-sm text-gold transition-colors hover:border-gold/60"
            >
              {filterLabel}
              <X size={13} aria-hidden="true" />
              <span className="sr-only">Clear this filter</span>
            </Link>
          )}
        </div>
        <div className="flex flex-col items-end gap-2">
          <AddHouse stageNames={stageNames} />
          <div className="flex items-center gap-4">
            <Link
              href="/admin/developments"
              className="text-sm text-white/45 underline underline-offset-4 hover:text-white"
            >
              Developments
            </Link>
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
        rows={shown.map((h) => ({
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

      {shown.length === 0 && (
        <p className="rounded-lg border border-white/5 bg-dark-card px-5 py-8 text-center text-white/45">
          {filterLabel ? (
            <>
              No houses {phaseFilter ? `in ${phaseFilter}` : "behind their dates"} right now.{" "}
              <Link href="/admin/houses" className="text-gold underline underline-offset-4">
                Show all houses
              </Link>
            </>
          ) : (
            <>
              No houses yet. Add one by talking to it, or drop in the examples below to
              see how it all works first.
            </>
          )}
        </p>
      )}

      <DemoHouses present={demoPresent} />

      <ExportEverything />
    </div>
  );
}

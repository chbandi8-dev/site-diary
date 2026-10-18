import { Suspense } from "react";
import { computeExpected } from "@/lib/expected";
import { loadPace } from "@/lib/pace-load";
import type { ForecastStage } from "@/lib/forecast";
import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/auth-guard";
import QuickSend from "@/components/admin/QuickSend";
import StageBoard from "@/components/admin/StageBoard";
import HouseStatus from "@/components/admin/HouseStatus";
import HouseTabs from "@/components/admin/HouseTabs";
import Inspections from "@/components/admin/Inspections";
import { OwnersTab, SiteTab, NotesTab, TabLoading } from "./tabs";
import HouseSettings from "@/components/admin/HouseSettings";

export const dynamic = "force-dynamic";

export default async function HouseCapture({ params }: { params: { id: string } }) {
  await requireStaff();

  // Only what the first tab and the header need. The other four tabs read their
  // own data behind it (see tabs.tsx), so the page shows as soon as this lands
  // instead of after everything he might look at has been fetched.
  // The badge counts need only the route id, so they travel with the house
  // rather than after it.
  const [house, openDecisions, drafts, openDefects, pace] = await Promise.all([
    prisma.house.findUnique({
    relationLoadStrategy: "join",
    where: { id: params.id },
    select: {
      id: true,
      address: true,
      suburb: true,
      lotNumber: true,
      storeys: true,
      status: true,
      development: { select: { name: true } },
      waitingOn: true,
      waitingOnEta: true,
      handoverFrom: true,
      handoverTo: true,
      startDate: true,
      targetHandover: true,
      inspections: {
        select: { id: true, kind: true, label: true, status: true, bookedFor: true, notes: true },
        orderBy: [{ bookedFor: "asc" }, { createdAt: "asc" }],
      },
      // Counts, not rows: the delete warning names what would be destroyed and
      // the tab badges show what is waiting, without loading any of it.
      _count: {
        select: {
          updates: { where: { deletedAt: null } },
          photos: { where: { deletedAt: null } },
          internalNotes: true,
          documents: true,
          weatherDays: { where: { workLost: true } },
        },
      },
      stages: {
        select: {
          id: true,
          name: true,
          phase: true,
          status: true,
          position: true,
          plannedDays: true,
          startedAt: true,
          completedAt: true,
          estimatedEnd: true,
          _count: { select: { updates: true } },
        },
        orderBy: { position: "asc" },
      },
      owners: {
        select: {
          revokedAt: true,
          lastSeenAt: true,
          owner: { select: { id: true, name: true, email: true, phone: true } },
        },
      },
    },
  }),
    prisma.decision.count({ where: { houseId: params.id, status: "open" } }),
    prisma.update.count({ where: { houseId: params.id, publishedAt: null, deletedAt: null } }),
    prisma.defect.count({ where: { houseId: params.id, status: { not: "resolved" } } }),
    loadPace(),
  ]);

  if (!house) notFound();

  const underway = house.stages.filter((s) => s.status === "in_progress");
  const owners = house.owners.filter((o) => !o.revokedAt);

  // For him only: nothing on the owner or builder pages reads this. Worked out
  // on the way in from rows already loaded, so it costs no query.
  const expected =
    house.status === "handed_over"
      ? null
      : computeExpected({
          startDate: house.startDate,
          promised: house.targetHandover ?? house.handoverTo,
          wetDaysLost: house._count.weatherDays,
          stages: house.stages as unknown as ForecastStage[],
          pace,
        });

  return (
    <div className="mx-auto max-w-3xl">
      <Link href="/admin/houses" className="text-sm text-white/45 hover:text-white">
        ← All houses
      </Link>

      <header className="mb-5 mt-3">
        {house.development && (
          <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-white/35">
            {house.development.name}
            {house.lotNumber ? ` · Lot ${house.lotNumber}` : ""}
          </p>
        )}
        <h1 className="mt-1 font-display text-2xl leading-tight text-white sm:text-3xl">
          {house.address}
        </h1>
        {house.status === "handed_over" && (
          <p className="mt-2 inline-block rounded-full bg-white/[0.08] px-3 py-1 font-mono text-[10px] uppercase tracking-[0.13em] text-white/55">
            Handed over
          </p>
        )}
        <p className="mt-1 text-sm leading-snug text-white/45">
          {owners.map((o) => o.owner.name).join(" & ") || "No owners linked"}
          {house.suburb ? ` · ${house.suburb}` : ""}
        </p>
        {expected && (
          <p
            className={`mt-1.5 text-sm leading-snug ${
              expected.state === "late"
                ? "text-red-300"
                : expected.state === "tight"
                  ? "text-amber-300"
                  : "text-white/60"
            }`}
          >
            {expected.summary}
            {expected.pacedStages > 0 && (
              <span className="block text-xs text-white/35">
                Uses your own pace on {expected.pacedStages} stage
                {expected.pacedStages === 1 ? "" : "s"}, the standard list on the rest.
              </span>
            )}
          </p>
        )}
        {underway.length > 0 && (
          <p className="mt-1.5 text-sm leading-snug text-gold/85">
            {underway.map((s) => s.name).join(" · ")}
          </p>
        )}

        <div className="mt-3">
          <HouseSettings
            houseId={house.id}
            address={house.address}
            suburb={house.suburb}
            lotNumber={house.lotNumber}
            storeys={house.storeys}
            status={house.status}
            holdings={{
              updates: house._count.updates,
              photos: house._count.photos,
              notes: house._count.internalNotes,
              documents: house._count.documents,
            }}
          />
        </div>
      </header>

      {/* Five tabs instead of fourteen stacked panels. Everything is still
          rendered — switching is instant and costs no network, which matters
          on a site with one bar of signal. */}
      <HouseTabs
        tabs={[
          { id: "today", label: "Today" },
          { id: "owners", label: "Owners", badge: openDecisions + drafts },
          { id: "site", label: "Site", badge: openDefects },
          { id: "private", label: "Notes" },
        ]}
      >
        <div>
          <Inspections
            houseId={house.id}
            items={house.inspections.map((i) => ({
              id: i.id,
              kind: i.kind,
              label: i.label,
              status: i.status,
              bookedFor: i.bookedFor?.toISOString() ?? null,
              notes: i.notes,
            }))}
          />

          <HouseStatus
                  houseId={house.id}
                  waitingOn={house.waitingOn}
                  waitingOnEta={house.waitingOnEta?.toISOString() ?? null}
                  handoverFrom={house.handoverFrom?.toISOString() ?? null}
                  handoverTo={house.handoverTo?.toISOString() ?? null}
                />

          <StageBoard
                  houseId={house.id}
                  stages={house.stages.map((s) => ({
                    id: s.id,
                    name: s.name,
                    phase: s.phase,
                    status: s.status,
                    notes: s._count.updates,
                  }))}
                />

          <QuickSend
                  houseId={house.id}
                  stages={house.stages.map((s) => ({ id: s.id, name: s.name, status: s.status }))}
                  owners={house.owners
                    .filter((o) => !o.revokedAt)
                    .map((o) => ({ id: o.owner.id, name: o.owner.name, phone: o.owner.phone }))}
                />
        </div>

        <Suspense fallback={<TabLoading />}>
          <OwnersTab houseId={house.id} address={house.address} owners={house.owners} />
        </Suspense>

        <Suspense fallback={<TabLoading />}>
          <SiteTab
            houseId={house.id}
            address={house.address}
            suburb={house.suburb}
            underway={underway.map((s) => s.name)}
          />
        </Suspense>

        <Suspense fallback={<TabLoading />}>
          <NotesTab houseId={house.id} />
        </Suspense>
      </HouseTabs>
    </div>
  );
}

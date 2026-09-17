import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/auth-guard";
import EstateBoard from "@/components/admin/EstateBoard";
import AssignHouses from "@/components/admin/AssignHouses";

export const dynamic = "force-dynamic";

/** Phase order, taken from the templates so the board reads left to right. */
async function phaseOrder(): Promise<string[]> {
  const templates = await prisma.stageTemplate.findMany({
    select: { phase: true },
    orderBy: { position: "asc" },
  });
  return Array.from(new Set(templates.map((t) => t.phase)));
}

export default async function DevelopmentPage({ params }: { params: { id: string } }) {
  await requireStaff();

  const development = await prisma.development.findUnique({
    where: { id: params.id },
    select: {
      id: true,
      name: true,
      client: true,
      release: true,
      houses: {
        select: {
          id: true,
          address: true,
          lotNumber: true,
          stages: {
            select: { name: true, phase: true, status: true, dueBy: true, estimatedEnd: true },
            orderBy: { position: "asc" },
          },
        },
      },
    },
  });
  if (!development) notFound();

  const [phases, available] = await Promise.all([
    phaseOrder(),
    prisma.house.findMany({
      where: { developmentId: null, status: { not: "handed_over" } },
      select: { id: true, address: true, suburb: true },
      orderBy: { address: "asc" },
    }),
  ]);

  // Lot order, not alphabetical — a run of lots is never in address order, and
  // reading the board depends on it matching the order they were built in.
  const lots = [...development.houses].sort((a, b) => {
    const na = Number(a.lotNumber);
    const nb = Number(b.lotNumber);
    if (Number.isFinite(na) && Number.isFinite(nb)) return na - nb;
    return (a.lotNumber ?? a.address).localeCompare(b.lotNumber ?? b.address);
  });

  const stageNames = Array.from(
    new Set(development.houses.flatMap((h) => h.stages.map((s) => s.name)))
  );

  return (
    <div className="mx-auto max-w-5xl">
      <Link href="/admin/developments" className="text-sm text-white/45 hover:text-white">
        ← Developments
      </Link>

      <header className="mb-7 mt-4">
        <h1 className="font-display text-3xl text-white">{development.name}</h1>
        <p className="mt-1 text-sm text-white/45">
          {[development.client, development.release, `${lots.length} lots`]
            .filter(Boolean)
            .join(" · ")}
        </p>
      </header>

      <EstateBoard
        phases={phases}
        stageNames={stageNames}
        lots={lots.map((h) => {
          // A phase is done when every stage in it is done, underway if any is,
          // and otherwise takes the furthest state reached. Owners see phases,
          // and so should the board.
          const byPhase: Record<string, string> = {};
          for (const phase of phases) {
            const inPhase = h.stages.filter((s) => s.phase === phase && s.status !== "not_applicable");
            if (inPhase.length === 0) {
              byPhase[phase] = "not_applicable";
            } else if (inPhase.every((s) => s.status === "complete")) {
              byPhase[phase] = "complete";
            } else if (inPhase.some((s) => s.status === "in_progress")) {
              byPhase[phase] = "in_progress";
            } else if (inPhase.some((s) => s.status === "on_hold")) {
              byPhase[phase] = "on_hold";
            } else if (inPhase.some((s) => s.status === "scheduled")) {
              byPhase[phase] = "scheduled";
            } else {
              byPhase[phase] = "not_started";
            }
          }

          // The worst slip on the lot: how far behind the stage that is
          // furthest behind its target. Only meaningful once a target date has
          // been set and the forecast run.
          const slips = h.stages
            .filter((s) => s.dueBy && s.estimatedEnd && s.status !== "complete")
            .map((s) =>
              Math.round((s.estimatedEnd!.getTime() - s.dueBy!.getTime()) / 86_400_000)
            );
          const worst = slips.length > 0 ? Math.max(...slips) : null;

          return {
            id: h.id,
            label: h.lotNumber ? `Lot ${h.lotNumber}` : h.address,
            address: h.address,
            phases: byPhase,
            behindDays: worst,
          };
        })}
      />

      <AssignHouses
        developmentId={development.id}
        inDevelopment={lots.map((h) => ({
          id: h.id,
          address: h.address,
          lotNumber: h.lotNumber,
        }))}
        available={available}
      />
    </div>
  );
}

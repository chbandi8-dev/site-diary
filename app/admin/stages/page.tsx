import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/auth-guard";
import StageTemplates from "@/components/admin/StageTemplates";

export const dynamic = "force-dynamic";

/**
 * The standard stage list.
 *
 * Its own page rather than a panel, because editing it is a rare, considered
 * act with consequences for every house he builds from here on — not something
 * to do by accident while checking a slab pour.
 */
export default async function StagesPage() {
  await requireStaff();

  const templates = await prisma.stageTemplate.findMany({
    select: {
      id: true,
      name: true,
      phase: true,
      position: true,
      typicalDays: true,
      isPaymentMilestone: true,
      _count: { select: { houseStages: true } },
    },
    orderBy: { position: "asc" },
  });

  return (
    <div className="mx-auto max-w-2xl">
      <Link href="/admin/houses" className="text-sm text-white/45 hover:text-white">
        ← Houses
      </Link>

      <header className="mb-7 mt-4">
        <h1 className="font-display text-3xl text-white">Standard stages</h1>
        <p className="mt-2 max-w-prose leading-relaxed text-white/50">
          What every new house starts with. Changing this list doesn&apos;t touch the
          houses already running — each one copied the list when it was created, so
          nothing here can rewrite a build that&apos;s already finished.
        </p>
        <p className="mt-3 max-w-prose text-sm leading-relaxed text-white/35">
          Which also means a stage added here won&apos;t appear on your current houses.
          Add it to those individually, from the stage board on each one — most one-offs
          genuinely are one-offs, and a list that grows every time somebody builds a pool
          stops being a checklist.
        </p>
      </header>

      <StageTemplates
        templates={templates.map((t) => ({
          id: t.id,
          name: t.name,
          phase: t.phase,
          position: t.position,
          typicalDays: t.typicalDays,
          isPaymentMilestone: t.isPaymentMilestone,
          houseCount: t._count.houseStages,
        }))}
      />
    </div>
  );
}

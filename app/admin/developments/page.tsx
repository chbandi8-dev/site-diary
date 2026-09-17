import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/auth-guard";
import DevelopmentList from "@/components/admin/DevelopmentList";

export const dynamic = "force-dynamic";

/**
 * Estates and developments.
 *
 * Empty for a builder doing only individual owner-builds, which is the point:
 * nothing about grouping is imposed on the work that does not need it.
 */
export default async function DevelopmentsPage() {
  await requireStaff();

  const [developments, unassigned] = await Promise.all([
    prisma.development.findMany({
      where: { archivedAt: null },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        client: true,
        release: true,
        _count: { select: { houses: true } },
      },
    }),
    prisma.house.count({ where: { developmentId: null, status: { not: "handed_over" } } }),
  ]);

  return (
    <div className="mx-auto max-w-2xl">
      <Link href="/admin/houses" className="text-sm text-white/45 hover:text-white">
        ← Houses
      </Link>

      <header className="mb-7 mt-4">
        <h1 className="font-display text-3xl text-white">Developments</h1>
        <p className="mt-2 max-w-prose leading-relaxed text-white/50">
          For estate work: a group of lots with one developer or agent behind them. Gives
          you a board instead of eighteen pages, and lets a stage be marked across a run
          of lots in one go.
        </p>
        <p className="mt-3 max-w-prose text-sm leading-relaxed text-white/35">
          Individual owner-builds don&apos;t need one — {unassigned} of your houses stand
          on their own and nothing here changes them.
        </p>
      </header>

      <DevelopmentList
        developments={developments.map((d) => ({
          id: d.id,
          name: d.name,
          client: d.client,
          release: d.release,
          houses: d._count.houses,
        }))}
      />
    </div>
  );
}

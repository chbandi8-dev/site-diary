import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { AlertCircle, Clock } from "lucide-react";

export const dynamic = "force-dynamic";

const DAYS_QUIET_BEFORE_FLAG = 5;

/**
 * The run sheet. Ordered so the houses that need him are at the top — a house
 * going quiet is the leading indicator of an owner about to ring.
 */
export default async function HousesPage() {
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
      _count: { select: { ownerReports: { where: { status: "submitted" } } } },
    },
    orderBy: { address: "asc" },
  });

  const now = Date.now();
  const withState = houses.map((h) => {
    const last = h.updates[0]?.occurredAt;
    const daysQuiet = last
      ? Math.floor((now - last.getTime()) / 86_400_000)
      : Number.POSITIVE_INFINITY;
    return { ...h, daysQuiet, needsAttention: daysQuiet >= DAYS_QUIET_BEFORE_FLAG || h._count.ownerReports > 0 };
  });

  withState.sort((a, b) => Number(b.needsAttention) - Number(a.needsAttention));

  return (
    <div>
      <header className="mb-8">
        <h1 className="font-display text-3xl text-white">Houses</h1>
        <p className="mt-1 text-white/50">
          {withState.filter((h) => h.needsAttention).length} need something · {withState.length} active
        </p>
      </header>

      <ul className="flex flex-col gap-2">
        {withState.map((h) => (
          <li key={h.id}>
            <Link
              href={`/admin/houses/${h.id}`}
              className="flex items-center justify-between gap-4 rounded-lg border border-white/5 bg-dark-card px-5 py-4 transition-colors hover:border-gold/40"
            >
              <div className="min-w-0">
                <span className="block truncate font-medium text-white">{h.address}</span>
                <span className="mt-0.5 block truncate text-sm text-white/45">
                  {h.stages.length > 0
                    ? h.stages.map((s) => s.name).join(" · ")
                    : "No stage underway"}
                  {h.waitingOn && ` — waiting on ${h.waitingOn}`}
                </span>
              </div>

              <div className="flex flex-none items-center gap-3">
                {h._count.ownerReports > 0 && (
                  <span className="flex items-center gap-1.5 rounded-full bg-gold/15 px-2.5 py-1 text-xs font-medium text-gold">
                    <AlertCircle size={13} aria-hidden="true" />
                    {h._count.ownerReports}
                  </span>
                )}
                <span
                  className={
                    "flex items-center gap-1.5 font-mono text-xs tabular-nums " +
                    (h.daysQuiet >= DAYS_QUIET_BEFORE_FLAG ? "text-gold" : "text-white/35")
                  }
                >
                  <Clock size={13} aria-hidden="true" />
                  {Number.isFinite(h.daysQuiet) ? `${h.daysQuiet}d` : "never"}
                </span>
              </div>
            </Link>
          </li>
        ))}
      </ul>

      {withState.length === 0 && (
        <p className="rounded-lg border border-white/5 bg-dark-card px-5 py-8 text-center text-white/45">
          No active houses yet.
        </p>
      )}
    </div>
  );
}

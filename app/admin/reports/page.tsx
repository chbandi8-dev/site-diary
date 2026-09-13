import { prisma } from "@/lib/prisma";
import Link from "next/link";
import ReportItem from "@/components/admin/ReportItem";

export const dynamic = "force-dynamic";

const KIND_LABEL: Record<string, string> = {
  question: "Question",
  issue: "Says something's wrong",
  maintenance: "Needs attention",
};

/**
 * What owners have raised, oldest first.
 *
 * Oldest first on purpose: the thing that damages trust is a report that sits,
 * and a newest-first list buries exactly those.
 */
export default async function ReportsPage() {
  const reports = await prisma.ownerReport.findMany({
    where: { status: { in: ["submitted", "acknowledged", "in_progress"] } },
    select: {
      id: true,
      kind: true,
      status: true,
      body: true,
      createdAt: true,
      photoId: true,
      house: { select: { id: true, address: true } },
      owner: { select: { name: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  return (
    <div className="mx-auto max-w-2xl">
      <header className="mb-8">
        <h1 className="font-display text-3xl text-white">From owners</h1>
        <p className="mt-1 text-white/50">
          {reports.length === 0
            ? "Nothing waiting."
            : `${reports.length} waiting on a reply`}
        </p>
      </header>

      <ol className="flex flex-col gap-3">
        {reports.map((r) => (
          <li key={r.id}>
            <ReportItem
              id={r.id}
              kind={KIND_LABEL[r.kind] ?? r.kind}
              status={r.status}
              body={r.body}
              hasPhoto={Boolean(r.photoId)}
              ownerName={r.owner.name}
              createdAt={r.createdAt.toISOString()}
              house={
                <Link href={`/admin/houses/${r.house.id}`} className="hover:text-gold">
                  {r.house.address}
                </Link>
              }
            />
          </li>
        ))}
      </ol>

      {reports.length === 0 && (
        <p className="rounded-lg border border-white/5 bg-dark-card px-5 py-8 text-center text-white/45">
          All caught up.
        </p>
      )}
    </div>
  );
}

import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import QuickSend from "@/components/admin/QuickSend";
import OwnerAccess from "@/components/admin/OwnerAccess";

export const dynamic = "force-dynamic";

export default async function HouseCapture({ params }: { params: { id: string } }) {
  const house = await prisma.house.findUnique({
    where: { id: params.id },
    select: {
      id: true,
      address: true,
      suburb: true,
      waitingOn: true,
      stages: {
        where: { status: { in: ["in_progress", "scheduled"] } },
        select: { id: true, name: true, status: true },
        orderBy: { position: "asc" },
      },
      owners: {
        select: {
          revokedAt: true,
          owner: { select: { id: true, name: true, email: true, authUserId: true } },
        },
      },
      updates: {
        select: { id: true, body: true, occurredAt: true, publishedAt: true, kind: true },
        orderBy: { occurredAt: "desc" },
        take: 8,
      },
    },
  });

  if (!house) notFound();

  return (
    <div className="mx-auto max-w-2xl">
      <Link href="/admin/houses" className="text-sm text-white/45 hover:text-white">
        ← All houses
      </Link>

      <header className="mb-7 mt-4">
        <h1 className="font-display text-3xl text-white">{house.address}</h1>
        <p className="mt-1 text-sm text-white/45">
          {house.owners
            .filter((o) => !o.revokedAt)
            .map((o) => o.owner.name)
            .join(" & ") || "No owners linked"}
          {house.stages.length > 0 && ` · ${house.stages.map((s) => s.name).join(", ")}`}
        </p>
      </header>

      <QuickSend houseId={house.id} />

      <OwnerAccess
        houseId={house.id}
        owners={house.owners.map((o) => ({
          ownerId: o.owner.id,
          name: o.owner.name,
          email: o.owner.email,
          hasSignedIn: Boolean(o.owner.authUserId),
          revoked: Boolean(o.revokedAt),
        }))}
      />

      <section className="mt-12">
        <h2 className="mb-4 font-mono text-[11px] uppercase tracking-[0.13em] text-white/40">
          Recently
        </h2>
        <ol className="flex flex-col">
          {house.updates.map((u) => (
            <li key={u.id} className="border-t border-white/5 py-3.5 first:border-t-0">
              <div className="mb-1 flex items-baseline gap-3">
                <time className="font-mono text-[11px] text-white/35">
                  {u.occurredAt.toLocaleDateString("en-AU", { day: "numeric", month: "short" })}
                </time>
                {!u.publishedAt && (
                  <span className="font-mono text-[10px] uppercase tracking-[0.13em] text-gold">
                    Draft — not sent
                  </span>
                )}
              </div>
              <p className="text-sm leading-relaxed text-white/75">{u.body}</p>
            </li>
          ))}
          {house.updates.length === 0 && (
            <li className="py-3 text-sm text-white/40">Nothing logged yet.</li>
          )}
        </ol>
      </section>
    </div>
  );
}

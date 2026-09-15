import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/auth-guard";
import QuickSend from "@/components/admin/QuickSend";
import HouseLink from "@/components/admin/HouseLink";
import RecentUpdates from "@/components/admin/RecentUpdates";
import InternalNotes from "@/components/admin/InternalNotes";
import DecisionsPanel from "@/components/admin/DecisionsPanel";
import StageBoard from "@/components/admin/StageBoard";
import HouseStatus from "@/components/admin/HouseStatus";

export const dynamic = "force-dynamic";

export default async function HouseCapture({ params }: { params: { id: string } }) {
  await requireStaff();
  const house = await prisma.house.findUnique({
    where: { id: params.id },
    select: {
      id: true,
      address: true,
      suburb: true,
      waitingOn: true,
      waitingOnEta: true,
      handoverFrom: true,
      handoverTo: true,
      stages: {
        select: { id: true, name: true, phase: true, status: true },
        orderBy: { position: "asc" },
      },
      owners: {
        select: {
          revokedAt: true,
          owner: { select: { id: true, name: true, email: true } },
        },
      },
      accessLinks: {
        where: { revokedAt: null },
        select: { hint: true, lastUsedAt: true, useCount: true },
        orderBy: { createdAt: "desc" },
        take: 1,
      },
      decisions: {
        where: { status: { in: ["open", "answered"] } },
        select: {
          id: true,
          question: true,
          dueDate: true,
          status: true,
          askedAt: true,
          answeredAt: true,
          answer: true,
        },
        orderBy: [{ status: "asc" }, { askedAt: "desc" }],
      },
      internalNotes: {
        select: {
          id: true,
          body: true,
          createdAt: true,
          author: { select: { name: true } },
        },
        orderBy: { createdAt: "desc" },
        take: 15,
      },
      updates: {
        where: { deletedAt: null },
        select: { id: true, body: true, occurredAt: true, publishedAt: true },
        orderBy: { occurredAt: "desc" },
        take: 10,
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
          {house.stages.filter((s) => s.status === "in_progress").length > 0 &&
            ` · ${house.stages
              .filter((s) => s.status === "in_progress")
              .map((s) => s.name)
              .join(", ")}`}
        </p>
      </header>

      <HouseStatus
        houseId={house.id}
        waitingOn={house.waitingOn}
        waitingOnEta={house.waitingOnEta?.toISOString() ?? null}
        handoverFrom={house.handoverFrom?.toISOString() ?? null}
        handoverTo={house.handoverTo?.toISOString() ?? null}
      />

      <StageBoard stages={house.stages} />

      <QuickSend houseId={house.id} />

      <HouseLink
        houseId={house.id}
        address={house.address}
        hasLink={house.accessLinks.length > 0}
        linkHint={house.accessLinks[0]?.hint ?? null}
        lastUsedAt={house.accessLinks[0]?.lastUsedAt?.toISOString() ?? null}
        useCount={house.accessLinks[0]?.useCount ?? 0}
        registered={house.owners.map((o) => ({
          ownerId: o.owner.id,
          name: o.owner.name,
          email: o.owner.email,
          revoked: Boolean(o.revokedAt),
        }))}
      />

      <DecisionsPanel
        houseId={house.id}
        decisions={house.decisions.map((d) => ({
          id: d.id,
          question: d.question,
          dueDate: d.dueDate?.toISOString() ?? null,
          status: d.status,
          askedAt: d.askedAt.toISOString(),
          answeredAt: d.answeredAt?.toISOString() ?? null,
          answer: d.answer,
        }))}
      />

      <InternalNotes
        houseId={house.id}
        notes={house.internalNotes.map((n) => ({
          id: n.id,
          body: n.body,
          createdAt: n.createdAt.toISOString(),
          author: n.author?.name ?? "",
        }))}
      />

      <RecentUpdates
        updates={house.updates.map((u) => ({
          id: u.id,
          body: u.body,
          occurredAt: u.occurredAt.toISOString(),
          published: Boolean(u.publishedAt),
        }))}
      />
    </div>
  );
}

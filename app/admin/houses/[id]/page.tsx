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
import VariationsPanel from "@/components/admin/VariationsPanel";
import DocumentsPanel from "@/components/admin/DocumentsPanel";
import WetDays from "@/components/admin/WetDays";
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
      variations: {
        select: {
          id: true,
          reference: true,
          description: true,
          amountCents: true,
          status: true,
          sentAt: true,
          approvedAt: true,
          declinedAt: true,
          declineReason: true,
          approvedBy: { select: { name: true } },
        },
        orderBy: { createdAt: "desc" },
      },
      documents: {
        where: { status: "ready" },
        select: { id: true, title: true, category: true, bytes: true, uploadedAt: true },
        orderBy: [{ category: "asc" }, { uploadedAt: "desc" }],
      },
      weatherDays: {
        where: { workLost: true },
        select: { id: true, date: true, note: true, rainfallMm: true, eotClaimedAt: true },
        orderBy: { date: "desc" },
        take: 60,
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

      <VariationsPanel
        houseId={house.id}
        variations={house.variations.map((v) => ({
          id: v.id,
          reference: v.reference,
          description: v.description,
          amountCents: v.amountCents,
          status: v.status,
          sentAt: v.sentAt?.toISOString() ?? null,
          approvedAt: v.approvedAt?.toISOString() ?? null,
          declinedAt: v.declinedAt?.toISOString() ?? null,
          declineReason: v.declineReason,
          decidedBy: v.approvedBy?.name ?? null,
        }))}
      />

      <DocumentsPanel
        houseId={house.id}
        documents={house.documents.map((d) => ({
          id: d.id,
          title: d.title,
          category: d.category,
          bytes: d.bytes,
          uploadedAt: d.uploadedAt.toISOString(),
        }))}
      />

      <WetDays
        houseId={house.id}
        days={house.weatherDays.map((d) => ({
          id: d.id,
          // Date-only column: taking the ISO prefix keeps a Sydney evening from
          // rendering as the day before once it crosses UTC midnight.
          date: d.date.toISOString().slice(0, 10),
          note: d.note,
          rainfallMm: d.rainfallMm,
          claimed: Boolean(d.eotClaimedAt),
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

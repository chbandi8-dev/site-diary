import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { signDownload } from "@/lib/r2";
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
import DefectsPanel from "@/components/admin/DefectsPanel";
import ForecastPanel from "@/components/admin/ForecastPanel";
import MessageTrade from "@/components/admin/MessageTrade";
import HouseStatus from "@/components/admin/HouseStatus";
import HouseTabs from "@/components/admin/HouseTabs";
import HouseSettings from "@/components/admin/HouseSettings";

export const dynamic = "force-dynamic";

export default async function HouseCapture({ params }: { params: { id: string } }) {
  await requireStaff();

  // All three run at once. They were awaited one after another, and none of
  // them depends on the others — every relation Prisma loads here is its own
  // round trip to the database, so doing them in series was paying the latency
  // three times over on the page he opens most.
  const [house, recentPhotos, trades] = await Promise.all([
    prisma.house.findUnique({
      where: { id: params.id },
      select: {
        id: true,
        address: true,
        suburb: true,
        lotNumber: true,
        storeys: true,
        development: { select: { name: true } },
        // Counted so the delete warning names what would actually be destroyed
        // rather than saying "and related data" like every other app.
        _count: {
          select: {
            updates: { where: { deletedAt: null } },
            photos: { where: { deletedAt: null } },
            internalNotes: true,
            documents: true,
          },
        },
        waitingOn: true,
        waitingOnEta: true,
        handoverFrom: true,
        handoverTo: true,
        stages: {
          select: {
            id: true,
            name: true,
            phase: true,
            status: true,
            _count: { select: { updates: true, photos: true } },
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
          take: 15,
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
          take: 15,
        },
        documents: {
          where: { status: "ready" },
          select: { id: true, title: true, category: true, bytes: true, uploadedAt: true },
          orderBy: [{ category: "asc" }, { uploadedAt: "desc" }],
          take: 25,
        },
        weatherDays: {
          where: { workLost: true },
          select: { id: true, date: true, note: true, rainfallMm: true, eotClaimedAt: true },
          orderBy: { date: "desc" },
          take: 30,
        },
        defects: {
          select: {
            id: true,
            reference: true,
            location: true,
            description: true,
            status: true,
            raisedByOwner: true,
            targetAt: true,
            resolvedAt: true,
          },
          orderBy: [{ status: "asc" }, { raisedAt: "asc" }],
          take: 40,
        },
        forecasts: {
          select: { from: true, to: true, reason: true, createdAt: true, notifiedAt: true },
          orderBy: { createdAt: "desc" },
          take: 4,
        },
        internalNotes: {
          select: {
            id: true,
            body: true,
            createdAt: true,
            author: { select: { name: true } },
          },
          orderBy: { createdAt: "desc" },
          take: 12,
        },
        updates: {
          where: { deletedAt: null },
          select: { id: true, body: true, occurredAt: true, publishedAt: true },
          orderBy: { occurredAt: "desc" },
          take: 8,
        },
      },
    }),

    // Recent photos, for sending to a trade. Keyed off the route parameter
    // rather than the loaded house, which is what lets this run in parallel.
    prisma.photo.findMany({
      where: { houseId: params.id, status: "ready", deletedAt: null },
      select: { id: true, key: true, caption: true, takenAt: true },
      orderBy: [{ takenAt: "desc" }, { createdAt: "desc" }],
      take: 8,
    }),

    // His address book, loaded alongside the house so a message about this
    // build is two taps rather than a trip to another screen and back.
    prisma.trade.findMany({
      where: { archivedAt: null },
      orderBy: [{ trade: "asc" }, { name: "asc" }],
      select: {
        id: true, name: true, company: true, trade: true,
        phone: true, email: true, notes: true,
      },
    }),
  ]);

  if (!house) notFound();

  // Signed here rather than in the browser — the bucket is private and these
  // are other people's homes. Signing is local, so it costs no round trip.
  const photos = await Promise.all(
    recentPhotos.map(async (p) => ({
      id: p.id,
      caption: p.caption,
      url: await signDownload(p.key),
    }))
  );

  const underway = house.stages.filter((s) => s.status === "in_progress");
  const owners = house.owners.filter((o) => !o.revokedAt);
  const openDecisions = house.decisions.filter((d) => d.status === "open").length;
  const openVariations = house.variations.filter((v) => v.status === "sent").length;
  const openDefects = house.defects.filter((d) => d.status !== "resolved").length;
  const drafts = house.updates.filter((u) => !u.publishedAt).length;

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
        <p className="mt-1 text-sm leading-snug text-white/45">
          {owners.map((o) => o.owner.name).join(" & ") || "No owners linked"}
          {house.suburb ? ` · ${house.suburb}` : ""}
        </p>
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
          { id: "money", label: "Money", badge: openVariations },
          { id: "site", label: "Site", badge: openDefects },
          { id: "private", label: "Notes" },
        ]}
      >
        <div>
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
                    photos: s._count.photos,
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

        <div>
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
                    phone: o.owner.phone,
                    lastSeenAt: o.lastSeenAt?.toISOString() ?? null,
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

          <RecentUpdates
                  updates={house.updates.map((u) => ({
                    id: u.id,
                    body: u.body,
                    occurredAt: u.occurredAt.toISOString(),
                    published: Boolean(u.publishedAt),
                  }))}
                />
        </div>

        <div>
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
        </div>

        <div>
          <DefectsPanel
                  houseId={house.id}
                  defects={house.defects.map((d) => ({
                    id: d.id,
                    reference: d.reference,
                    location: d.location,
                    description: d.description,
                    status: d.status,
                    raisedByOwner: d.raisedByOwner,
                    targetAt: d.targetAt?.toISOString() ?? null,
                    resolvedAt: d.resolvedAt?.toISOString() ?? null,
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

          <MessageTrade
                  address={house.address}
                  suburb={house.suburb}
                  trades={trades}
                  photos={photos}
                  underway={house.stages.filter((s) => s.status === "in_progress").map((s) => s.name)}
                  openDefects={house.defects
                    .filter((d) => d.status !== "resolved")
                    .map((d) => ({
                      reference: d.reference,
                      location: d.location,
                      description: d.description,
                    }))}
                />

          <ForecastPanel
                  houseId={house.id}
                  history={house.forecasts.map((h) => ({
                    from: h.from.toISOString(),
                    to: h.to.toISOString(),
                    reason: h.reason,
                    createdAt: h.createdAt.toISOString(),
                    notified: Boolean(h.notifiedAt),
                  }))}
                />
        </div>

        <div>
          <InternalNotes
                  houseId={house.id}
                  notes={house.internalNotes.map((n) => ({
                    id: n.id,
                    body: n.body,
                    createdAt: n.createdAt.toISOString(),
                    author: n.author?.name ?? "",
                  }))}
                />
        </div>
      </HouseTabs>
    </div>
  );
}

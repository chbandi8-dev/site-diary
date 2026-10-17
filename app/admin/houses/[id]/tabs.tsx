import { prisma } from "@/lib/prisma";
import { signDownload } from "@/lib/r2";
import HouseLink from "@/components/admin/HouseLink";
import RecentUpdates from "@/components/admin/RecentUpdates";
import InternalNotes from "@/components/admin/InternalNotes";
import DecisionsPanel from "@/components/admin/DecisionsPanel";
import DocumentsPanel from "@/components/admin/DocumentsPanel";
import WetDays from "@/components/admin/WetDays";
import DefectsPanel from "@/components/admin/DefectsPanel";
import ForecastPanel from "@/components/admin/ForecastPanel";
import MessageTrade from "@/components/admin/MessageTrade";

/**
 * The tabs he does not land on.
 *
 * The first tab is what he opens a house to see, and it needs only the house,
 * its stages and its owners. Everything here used to be read in the same query
 * before anything was sent, so the page waited on a tab he might never open.
 * Each is now its own piece that streams in behind the first, all reading at
 * once: the page appears after the first read, and these fill in as they land.
 * The work is the same; what he waits for is not.
 */

type Owners = {
  owner: { id: string; name: string; email: string | null; phone: string | null };
  revokedAt: Date | null;
  lastSeenAt: Date | null;
}[];

export async function OwnersTab({ houseId, address, owners }: { houseId: string; address: string; owners: Owners }) {
  const [accessLinks, decisions, updates] = await Promise.all([
    prisma.accessLink.findMany({
      where: { houseId, revokedAt: null },
      select: { hint: true, lastUsedAt: true, useCount: true },
      orderBy: { createdAt: "desc" },
      take: 1,
    }),
    prisma.decision.findMany({
      where: { houseId, status: { in: ["open", "answered"] } },
      select: {
        id: true, question: true, dueDate: true, status: true,
        askedAt: true, answeredAt: true, answer: true,
      },
      orderBy: [{ status: "asc" }, { askedAt: "desc" }],
      take: 15,
    }),
    prisma.update.findMany({
      where: { houseId, deletedAt: null },
      select: { id: true, body: true, occurredAt: true, publishedAt: true },
      orderBy: { occurredAt: "desc" },
      take: 8,
    }),
  ]);
  const house = { id: houseId, address, accessLinks, decisions, updates, owners };
  return (
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
  );
}

export async function SiteTab({
  houseId, address, suburb, underway,
}: { houseId: string; address: string; suburb: string | null; underway: string[] }) {
  const [defects, weatherDays, forecasts, recentPhotos, trades] = await Promise.all([
    prisma.defect.findMany({
      where: { houseId },
      select: {
        id: true, reference: true, location: true, description: true, status: true,
        raisedByOwner: true, targetAt: true, resolvedAt: true,
      },
      orderBy: [{ status: "asc" }, { raisedAt: "asc" }],
      take: 40,
    }),
    prisma.weatherDay.findMany({
      where: { houseId, workLost: true },
      select: { id: true, date: true, note: true, rainfallMm: true, eotClaimedAt: true },
      orderBy: { date: "desc" },
      take: 30,
    }),
    prisma.handoverForecast.findMany({
      where: { houseId },
      select: { from: true, to: true, reason: true, createdAt: true, notifiedAt: true },
      orderBy: { createdAt: "desc" },
      take: 4,
    }),
    // Recent photos, for sending to a trade.
    prisma.photo.findMany({
      where: { houseId, status: "ready", deletedAt: null },
      select: { id: true, key: true, caption: true, takenAt: true },
      orderBy: [{ takenAt: "desc" }, { createdAt: "desc" }],
      take: 8,
    }),
    // His address book, so a message about this build is two taps.
    prisma.trade.findMany({
      where: { archivedAt: null },
      orderBy: [{ trade: "asc" }, { name: "asc" }],
      select: {
        id: true, name: true, company: true, trade: true,
        phone: true, email: true, notes: true,
      },
    }),
  ]);

  // Signed here rather than in the browser — the bucket is private and these
  // are other people's homes. Signing is local, so it costs no round trip.
  const photos = await Promise.all(
    recentPhotos.map(async (p) => ({
      id: p.id,
      caption: p.caption,
      url: await signDownload(p.key),
    }))
  );

  const house = { id: houseId, address, suburb, defects, weatherDays, forecasts };
  return (
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
                  suburb={suburb}
                  trades={trades}
                  photos={photos}
                  underway={underway}
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
  );
}

export async function NotesTab({ houseId }: { houseId: string }) {
  const [internalNotes, documents] = await Promise.all([
    prisma.internalNote.findMany({
      where: { houseId },
      select: { id: true, body: true, createdAt: true, author: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
      take: 12,
    }),
    prisma.document.findMany({
      where: { houseId, status: "ready" },
      select: { id: true, title: true, category: true, bytes: true, uploadedAt: true },
      orderBy: [{ category: "asc" }, { uploadedAt: "desc" }],
      take: 25,
    }),
  ]);
  const house = { id: houseId, internalNotes, documents };
  return (
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
  );
}

/** What a tab shows for the moment before its own data lands. */
export function TabLoading() {
  return (
    <div className="animate-pulse space-y-3" aria-hidden="true">
      <div className="h-24 rounded-lg border border-white/5 bg-dark-card" />
      <div className="h-24 rounded-lg border border-white/5 bg-dark-card" />
    </div>
  );
}

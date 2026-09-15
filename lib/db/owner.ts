import { prisma } from "@/lib/prisma";
import { signDownload } from "@/lib/r2";

/**
 * Every read on the homeowner side.
 *
 * Owners hold a house link, not an account, so there is no Supabase session to
 * scope queries with — which means the old row-level-security guarantee does
 * not apply here. Two things replace it, and both matter:
 *
 *  1. Owners never talk to the database directly. The anon key is not shipped
 *     to the browser and no PostgREST surface is exposed, so the only way to
 *     read anything is through these functions.
 *  2. Every function takes `houseId` as its first argument, and the ONLY caller
 *     that supplies it is `redeemToken`, which resolves it from a live,
 *     unrevoked link. Nothing reads a house id from a URL, a form, or a header.
 *
 * If you add a function here, keep that shape. The moment one of them accepts a
 * house id from request input, a link to one build becomes a key to all of them.
 */

export type OwnerHouse = Awaited<ReturnType<typeof getHouse>>;

export async function getHouse(houseId: string) {
  return prisma.house.findUnique({
    where: { id: houseId },
    select: {
      id: true,
      address: true,
      suburb: true,
      storeys: true,
      status: true,
      waitingOn: true,
      waitingOnEta: true,
      handoverFrom: true,
      handoverTo: true,
      handedOverAt: true,
    },
  });
}

export async function getStages(houseId: string) {
  return prisma.houseStage.findMany({
    where: { houseId, status: { not: "not_applicable" } },
    select: {
      id: true,
      name: true,
      phase: true,
      position: true,
      status: true,
      estimatedEnd: true,
      completedAt: true,
      isPaymentMilestone: true,
    },
    orderBy: { position: "asc" },
  });
}

/**
 * The timeline. Published, undeleted updates only — a draft is not an update,
 * and something the owner was already emailed about must stop rendering without
 * the row disappearing from the record.
 */
export async function getTimeline(houseId: string, limit = 40) {
  const updates = await prisma.update.findMany({
    where: { houseId, publishedAt: { not: null }, deletedAt: null },
    select: {
      id: true,
      kind: true,
      body: true,
      occurredAt: true,
      photos: {
        where: { status: "ready", deletedAt: null },
        select: { id: true, key: true, caption: true },
        orderBy: { takenAt: "asc" },
      },
    },
    orderBy: { occurredAt: "desc" },
    take: limit,
  });

  // Photos live in a private bucket, so each render mints short-lived signed
  // URLs. Access has already been established by the link.
  return Promise.all(
    updates.map(async (u) => ({
      ...u,
      occurred_at: u.occurredAt.toISOString(),
      // `key` is deliberately dropped rather than spread: it publishes the
      // bucket layout to the browser for no benefit.
      photos: await Promise.all(
        u.photos.map(async (p) => ({
          id: p.id,
          caption: p.caption,
          url: await signDownload(p.key),
        }))
      ),
    }))
  );
}

/**
 * What this person has raised, and his replies.
 *
 * Scoped to the individual, not the house. A link ends up in a group chat with
 * in-laws, a broker, sometimes a previous owner — and these threads contain
 * whatever the owner chose to write plus the builder's answer, which may touch
 * cost or blame. The house is shared; the correspondence is not.
 */
export async function getReports(houseId: string, ownerId: string) {
  return prisma.ownerReport.findMany({
    where: { houseId, ownerId },
    select: {
      id: true,
      kind: true,
      status: true,
      body: true,
      createdAt: true,
      acknowledgedAt: true,
      replyBody: true,
      repliedAt: true,
      owner: { select: { name: true } },
    },
    orderBy: { createdAt: "desc" },
  });
}

export type OwnerStage = Awaited<ReturnType<typeof getStages>>[number];

export function activeStages(stages: OwnerStage[]): OwnerStage[] {
  return stages.filter((s) => s.status === "in_progress");
}

export function nextStage(stages: OwnerStage[]): OwnerStage | undefined {
  return stages.find((s) => s.status === "scheduled" || s.status === "not_started");
}

// ---------------------------------------------------------------------------
// Writes.
//
// Same rule as the reads: `houseId` is always the first argument and always
// comes from a verified link. Nothing here derives a house from request input,
// which is what stops a link to one build becoming a key to another.
// ---------------------------------------------------------------------------

/** Confirms a photo belongs to this house before it can be cited in a report. */
/**
 * Confirms a photo may be cited in a report.
 *
 * Narrower than "belongs to this house": most of his photos are internal
 * evidence — a defect for a subbie, proof for a claim — and were never
 * published. An owner may only point at something they can already see, or one
 * of their own.
 */
export async function photoBelongsToHouse(houseId: string, photoId: string): Promise<boolean> {
  const photo = await prisma.photo.findFirst({
    where: {
      id: photoId,
      houseId,
      status: "ready",
      deletedAt: null,
      OR: [
        { origin: "owner" },
        { update: { publishedAt: { not: null }, deletedAt: null } },
      ],
    },
    select: { id: true },
  });
  return Boolean(photo);
}

export async function createReport(
  houseId: string,
  ownerId: string,
  input: { kind: "question" | "issue" | "maintenance"; body: string; photoId?: string }
) {
  return prisma.ownerReport.create({
    data: {
      houseId,
      ownerId,
      kind: input.kind,
      body: input.body,
      photoId: input.photoId,
    },
    select: { id: true },
  });
}

export async function createOwnerPhoto(
  houseId: string,
  input: { id: string; key: string; bytes: number }
) {
  return prisma.photo.create({
    data: {
      id: input.id,
      houseId,
      key: input.key,
      bytes: input.bytes,
      status: "ready",
      origin: "owner",
    },
    select: { id: true },
  });
}

/**
 * The builder's own name and number.
 *
 * Withholding these doesn't stop the phone call, it just makes the page feel
 * like a wall between an owner and their builder. And a forwarded link should
 * open on something that says whose page it is.
 */
export async function getBuilder() {
  const rows = await prisma.siteContent.findMany({
    where: { key: { in: ["company_name", "contact_phone", "contact_email"] } },
    select: { key: true, value: true },
  });
  const map = new Map(rows.map((r) => [r.key, r.value]));
  return {
    name: map.get("company_name") ?? null,
    phone: map.get("contact_phone") ?? null,
    email: map.get("contact_email") ?? null,
  };
}

/** Choices the builder is waiting on from this house. */
export async function getDecisions(houseId: string) {
  return prisma.decision.findMany({
    where: { houseId, status: { in: ["open", "answered"] } },
    select: {
      id: true,
      question: true,
      detail: true,
      options: true,
      dueDate: true,
      consequence: true,
      status: true,
      askedAt: true,
      answeredAt: true,
      answer: true,
    },
    orderBy: [{ status: "asc" }, { dueDate: "asc" }],
  });
}

/**
 * An owner answering.
 *
 * Only an open decision on their own house can be answered, and the answer
 * timestamp is the server's. A client-supplied one would be worthless in the
 * argument this record exists to settle.
 */
export async function answerDecision(
  houseId: string,
  decisionId: string,
  answer: string
): Promise<boolean> {
  const result = await prisma.decision.updateMany({
    where: { id: decisionId, houseId, status: "open" },
    data: { answer, answeredAt: new Date(), status: "answered" },
  });
  return result.count === 1;
}

// ---------------------------------------------------------------------------
// Variations.
//
// The only thing on the owner's page that costs them money, which is why it is
// the only thing guarded by more than the link. See
// `app/api/owner/variations/route.ts` for what the one-time code does and does
// not prove.
// ---------------------------------------------------------------------------

/**
 * What this house has been asked to agree to.
 *
 * Drafts are excluded: a variation he is still pricing is not an offer, and an
 * owner seeing a number that later changes is worse than seeing nothing.
 */
export async function getVariations(houseId: string) {
  return prisma.variation.findMany({
    where: { houseId, status: { in: ["sent", "approved", "declined"] } },
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
    orderBy: [{ sentAt: "desc" }],
  });
}

/** One variation, scoped to the house the link resolved to. */
export async function getVariationForDecision(houseId: string, variationId: string) {
  return prisma.variation.findFirst({
    where: { id: variationId, houseId, status: "sent" },
    select: {
      id: true,
      reference: true,
      description: true,
      amountCents: true,
      houseId: true,
      codeHash: true,
      codeSentTo: true,
      codeExpiresAt: true,
      codeAttempts: true,
      house: { select: { address: true } },
    },
  });
}

export async function storeVariationCode(
  houseId: string,
  variationId: string,
  input: { codeHash: string; sentTo: string; expiresAt: Date }
): Promise<boolean> {
  // `status: "sent"` in the filter is what stops a code being minted for a
  // variation that has already been decided, which would otherwise allow a
  // second, later decision to overwrite the first.
  const result = await prisma.variation.updateMany({
    where: { id: variationId, houseId, status: "sent" },
    data: {
      codeHash: input.codeHash,
      codeSentTo: input.sentTo,
      codeExpiresAt: input.expiresAt,
      codeAttempts: 0,
    },
  });
  return result.count === 1;
}

export async function countVariationAttempt(
  houseId: string,
  variationId: string
): Promise<void> {
  await prisma.variation.updateMany({
    where: { id: variationId, houseId },
    data: { codeAttempts: { increment: 1 } },
  });
}

/**
 * Records the decision and burns the code in one statement.
 *
 * `status: "sent"` in the where clause makes this idempotent under a double
 * tap: the second write matches nothing, so a variation cannot be approved and
 * then declined a second later by an impatient thumb.
 */
export async function decideVariation(
  houseId: string,
  variationId: string,
  input:
    | { decision: "approve"; ownerId: string; ip: string | null }
    | { decision: "decline"; ownerId: string; ip: string | null; reason: string | null }
): Promise<boolean> {
  const now = new Date();
  const result = await prisma.variation.updateMany({
    where: { id: variationId, houseId, status: "sent" },
    data:
      input.decision === "approve"
        ? {
            status: "approved",
            approvedAt: now,
            approvedById: input.ownerId,
            approvedIp: input.ip,
            codeHash: null,
            codeExpiresAt: null,
          }
        : {
            status: "declined",
            declinedAt: now,
            declineReason: input.reason,
            approvedById: input.ownerId,
            approvedIp: input.ip,
            codeHash: null,
            codeExpiresAt: null,
          },
  });
  return result.count === 1;
}

// ---------------------------------------------------------------------------
// Documents and weather.
// ---------------------------------------------------------------------------

/**
 * Their paperwork. Signed URLs are minted per render, same as photos — the
 * bucket is private and a plan set is not something to leave on a public URL.
 */
export async function getDocuments(houseId: string) {
  const docs = await prisma.document.findMany({
    where: { houseId, status: "ready" },
    select: {
      id: true,
      title: true,
      category: true,
      key: true,
      bytes: true,
      mimeType: true,
      uploadedAt: true,
    },
    orderBy: [{ category: "asc" }, { uploadedAt: "desc" }],
  });

  return Promise.all(
    docs.map(async (d) => ({
      id: d.id,
      title: d.title,
      category: d.category,
      bytes: d.bytes,
      mimeType: d.mimeType,
      uploadedAt: d.uploadedAt,
      url: await signDownload(d.key),
    }))
  );
}

/**
 * Days lost to weather.
 *
 * Shown because "why has my date moved" is the question underneath most owner
 * frustration, and a list of dates answers it better than a paragraph. Only
 * days where work was actually lost appear — it raining on a Sunday is not
 * something an owner needs a notification about.
 */
export async function getWetDays(houseId: string, limit = 60) {
  return prisma.weatherDay.findMany({
    where: { houseId, workLost: true },
    select: { id: true, date: true, note: true, rainfallMm: true },
    orderBy: { date: "desc" },
    take: limit,
  });
}

/**
 * The walk-through list.
 *
 * Owner-visible from the moment it exists, including the items his own sweep
 * found. Hiding those would make the list look like a record of his mistakes
 * rather than what it is — the work being closed out.
 */
export async function getDefects(houseId: string) {
  return prisma.defect.findMany({
    where: { houseId },
    select: {
      id: true,
      reference: true,
      location: true,
      description: true,
      status: true,
      raisedByOwner: true,
      resolvedAt: true,
    },
    orderBy: [{ status: "asc" }, { raisedAt: "asc" }],
  });
}

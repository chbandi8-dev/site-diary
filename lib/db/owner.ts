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
      photos: await Promise.all(
        u.photos.map(async (p) => ({ ...p, url: await signDownload(p.key) }))
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
export async function photoBelongsToHouse(houseId: string, photoId: string): Promise<boolean> {
  const photo = await prisma.photo.findFirst({
    where: { id: photoId, houseId },
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

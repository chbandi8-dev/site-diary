import { createHash, randomBytes } from "crypto";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";

/**
 * Owner access, without a sign-in.
 *
 * One permanent link per house, sent over WhatsApp. Tapping it is the entire
 * journey — no account, no password, no code. The token in the URL is the
 * credential.
 *
 * The separation that makes this worth its trade-off:
 *
 *     the LINK is access.      the EMAIL is delivery.
 *
 * They are unrelated. A mistyped email costs notifications, never access — the
 * link keeps working. That is a far kinder failure than a sign-in, where a
 * wrong address locks someone out of their own house.
 *
 * Because owners never talk to Supabase directly, the anon key is never shipped
 * to a browser and there is no owner-facing PostgREST surface at all. Every read
 * goes through `lib/db/owner.ts`, whose functions take a house id that this
 * module has already verified against a live, unrevoked link.
 */

const LINK_COOKIE = "sd_link";
const WHO_COOKIE = "sd_who";
const ONE_YEAR = 60 * 60 * 24 * 365;

export type HouseAccess = { linkId: string; houseId: string };

function hash(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Issues the house's link. The raw token is returned exactly once — only its
 * hash is stored, so a copy of the database hands nobody a working link.
 * Issuing a new one revokes whatever came before.
 */
export async function issueHouseLink(houseId: string): Promise<string> {
  const token = randomBytes(32).toString("base64url");

  await prisma.$transaction([
    prisma.accessLink.updateMany({
      where: { houseId, revokedAt: null },
      data: { revokedAt: new Date() },
    }),
    prisma.accessLink.create({
      data: { houseId, tokenHash: hash(token), hint: token.slice(-4) },
    }),
  ]);

  return token;
}

/** Resolves a raw token to its house, and records the visit. */
export async function redeemToken(token: string): Promise<HouseAccess | null> {
  if (!token || token.length < 20) return null;

  const link = await prisma.accessLink.findUnique({
    where: { tokenHash: hash(token) },
    select: { id: true, houseId: true, revokedAt: true },
  });
  if (!link || link.revokedAt) return null;

  // Access logging is what link-only access would otherwise give up. Knowing an
  // owner opened their page, and when, matters to him day to day and matters
  // more if anything is ever disputed.
  await prisma.accessLink.update({
    where: { id: link.id },
    data: { lastUsedAt: new Date(), useCount: { increment: 1 } },
  });

  return { linkId: link.id, houseId: link.houseId };
}

/**
 * Remembers the link on this device for a year, so they can return by bookmark
 * instead of digging through WhatsApp. The cookie carries the same secret the
 * URL does, so it grants nothing extra; httpOnly keeps it away from scripts.
 */
export function rememberLink(token: string) {
  cookies().set(LINK_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: ONE_YEAR,
  });
}

/** The house this device may see, or null. */
export async function currentHouse(): Promise<HouseAccess | null> {
  const token = cookies().get(LINK_COOKIE)?.value;
  if (!token) return null;
  return redeemToken(token);
}

/**
 * Who is looking, once they have told us.
 *
 * Viewing needs no identity at all — they see the house the moment they tap the
 * link. This is only set after someone registers for updates, and it is what
 * lets a question be attributed to a person he can reply to.
 */
export async function currentViewer(
  houseId: string
): Promise<{ id: string; name: string; email: string | null } | null> {
  const ownerId = cookies().get(WHO_COOKIE)?.value;
  if (!ownerId) return null;

  // Re-checked against this house every time, so a stale cookie from another
  // build can never attach someone to the wrong one.
  const link = await prisma.houseOwner.findFirst({
    where: { houseId, ownerId, revokedAt: null },
    select: { owner: { select: { id: true, name: true, email: true } } },
  });

  return link?.owner ?? null;
}

/**
 * Registers whoever is holding the link for updates on this house.
 *
 * Deliberately not a sign-up: no password, nothing to confirm, and they have
 * already seen their house by this point. Matching on email means a returning
 * person on a new device rejoins their existing record rather than becoming a
 * duplicate.
 */
export async function registerViewer(
  houseId: string,
  name: string,
  email: string
): Promise<{ id: string }> {
  const normalised = email.trim().toLowerCase();

  const owner = await prisma.owner.upsert({
    where: { email: normalised },
    update: { name: name.trim(), registeredAt: new Date() },
    create: { name: name.trim(), email: normalised, registeredAt: new Date() },
  });

  await prisma.houseOwner.upsert({
    where: { houseId_ownerId: { houseId, ownerId: owner.id } },
    update: { revokedAt: null },
    create: { houseId, ownerId: owner.id },
  });

  cookies().set(WHO_COOKIE, owner.id, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: ONE_YEAR,
  });

  return { id: owner.id };
}

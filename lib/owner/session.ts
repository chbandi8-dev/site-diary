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

// __Host- requires Secure, path=/ and no Domain — which these already are. It
// stops a compromised sibling subdomain writing a cookie onto the parent.
const PROD = process.env.NODE_ENV === "production";
const LINK_COOKIE = PROD ? "__Host-sd_link" : "sd_link";
const WHO_COOKIE = PROD ? "__Host-sd_who" : "sd_who";
const ONE_YEAR = 60 * 60 * 24 * 365;
const VISIT_THROTTLE_MS = 60 * 60 * 1000;

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

/**
 * Resolves a raw token to its house.
 *
 * Read-only. This runs on every owner page render and every owner API call, so
 * it must not write — the previous version incremented a counter on each one,
 * which took a row lock per request on a single-connection pool and turned the
 * "opened 47 times" figure in the admin into a count of HTTP requests. Visits
 * are recorded separately, by `recordVisit`, and throttled.
 */
export async function redeemToken(token: string): Promise<HouseAccess | null> {
  if (!token || token.length < 20) return null;

  const link = await prisma.accessLink.findUnique({
    where: { tokenHash: hash(token) },
    select: { id: true, houseId: true, revokedAt: true },
  });
  if (!link || link.revokedAt) return null;

  return { linkId: link.id, houseId: link.houseId };
}

/**
 * Records that someone actually opened the page.
 *
 * Access logging is the compensating control for link-only access — knowing an
 * owner opened their build, and when, matters day to day and matters more if
 * anything is ever disputed. Throttled to once an hour per link so it counts
 * visits rather than renders.
 */
export async function recordVisit(linkId: string): Promise<void> {
  const cutoff = new Date(Date.now() - VISIT_THROTTLE_MS);
  await prisma.accessLink.updateMany({
    where: { id: linkId, OR: [{ lastUsedAt: null }, { lastUsedAt: { lt: cutoff } }] },
    data: { lastUsedAt: new Date(), useCount: { increment: 1 } },
  });
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
 * already seen their house by this point.
 *
 * Identity is resolved WITHIN this house and never across the database. The
 * email is unverified by design — the link is access, the email is only
 * delivery — so matching a global `owners` row on it would let anyone holding
 * any link type a stranger's address and thereby rename them, and subscribe
 * them to a different family's build updates from the builder's own domain.
 *
 * A returning person on a new device rejoins their existing record for THIS
 * house. Someone whose access was revoked stays revoked: re-registering must
 * not be a way to undo the only removal control there is.
 */
export async function registerViewer(
  houseId: string,
  name: string,
  email: string
): Promise<{ id: string } | { error: "revoked" }> {
  const normalised = email.trim().toLowerCase();

  const existing = await prisma.houseOwner.findFirst({
    where: { houseId, owner: { email: normalised } },
    select: { revokedAt: true, ownerId: true },
  });

  if (existing?.revokedAt) return { error: "revoked" };

  let ownerId = existing?.ownerId;

  if (ownerId) {
    await prisma.owner.update({
      where: { id: ownerId },
      data: { name: name.trim(), registeredAt: new Date() },
    });
  } else {
    const created = await prisma.owner.create({
      data: { name: name.trim(), email: normalised, registeredAt: new Date() },
      select: { id: true },
    });
    ownerId = created.id;
    await prisma.houseOwner.create({ data: { houseId, ownerId } });
  }

  const owner = { id: ownerId };

  cookies().set(WHO_COOKIE, owner.id, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: ONE_YEAR,
  });

  return { id: owner.id };
}

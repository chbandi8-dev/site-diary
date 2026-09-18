import { createHash, randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";

/**
 * The key to a read-only board.
 *
 * Same shape as the owner access link — a random token, only its hash stored,
 * revocable — but pointed at a different thing. An owner link opens one house
 * completely; this opens every house shallowly. Both are link-as-credential,
 * so both are revocable and both record that they were used.
 */

function hash(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function issueBoardLink(opts: {
  label: string;
  developmentId?: string | null;
}): Promise<string> {
  const token = randomBytes(32).toString("base64url");
  await prisma.boardLink.create({
    data: {
      tokenHash: hash(token),
      hint: token.slice(-4),
      label: opts.label,
      developmentId: opts.developmentId ?? null,
    },
  });
  return token;
}

export type BoardAccess = { linkId: string; developmentId: string | null };

/**
 * Read-only, like its owner-side counterpart and for the same reason: this runs
 * on every render of the board, and writing here would take a row lock per
 * request. Visits are recorded separately and throttled.
 */
export async function redeemBoardToken(token: string): Promise<BoardAccess | null> {
  if (!token || token.length < 20) return null;

  const link = await prisma.boardLink.findUnique({
    where: { tokenHash: hash(token) },
    select: { id: true, developmentId: true, revokedAt: true },
  });
  if (!link || link.revokedAt) return null;

  return { linkId: link.id, developmentId: link.developmentId };
}

/** Throttled to once an hour, so the count means visits rather than requests. */
export async function recordBoardVisit(linkId: string): Promise<void> {
  const hourAgo = new Date(Date.now() - 3_600_000);
  await prisma.boardLink.updateMany({
    where: { id: linkId, OR: [{ lastUsedAt: null }, { lastUsedAt: { lt: hourAgo } }] },
    data: { lastUsedAt: new Date(), useCount: { increment: 1 } },
  });
}

export async function revokeBoardLink(id: string): Promise<void> {
  await prisma.boardLink.updateMany({
    where: { id, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

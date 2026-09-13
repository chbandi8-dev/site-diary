import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * Two cheap protections on the endpoints anyone holding a house link can reach.
 *
 * Neither needs new infrastructure. At 25 houses a counted query is free, and
 * the alternative — a rate-limiting service — is more moving parts than the
 * problem deserves.
 */

/**
 * Same-origin check.
 *
 * The cookies are SameSite=Lax, so a cross-site POST does not carry them today
 * and this is defence in depth. It exists so the protection stops depending on
 * a browser default that somebody may one day relax.
 */
export function wrongOrigin(req: NextRequest): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return false; // same-origin form posts and server calls omit it
  try {
    return new URL(origin).host !== req.headers.get("host");
  } catch {
    return true;
  }
}

type Limit = { table: "reports" | "registrations" | "photos"; max: number; windowHours: number };

const LIMITS: Record<Limit["table"], Limit> = {
  // Each report emails every staff member, so this is the one that can be used
  // to bury him and burn the email quota.
  reports: { table: "reports", max: 12, windowHours: 1 },
  registrations: { table: "registrations", max: 6, windowHours: 1 },
  // sharp runs server-side per upload, so this is also a CPU and memory bound.
  photos: { table: "photos", max: 20, windowHours: 1 },
};

/**
 * Counts recent activity for one house. Returns a response to send back when
 * the limit is hit, or null to carry on.
 */
export async function overLimit(
  houseId: string,
  kind: Limit["table"]
): Promise<NextResponse | null> {
  const { max, windowHours } = LIMITS[kind];
  const since = new Date(Date.now() - windowHours * 3_600_000);

  const count =
    kind === "reports"
      ? await prisma.ownerReport.count({ where: { houseId, createdAt: { gte: since } } })
      : kind === "registrations"
        ? await prisma.houseOwner.count({ where: { houseId, invitedAt: { gte: since } } })
        : await prisma.photo.count({
            where: { houseId, origin: "owner", createdAt: { gte: since } },
          });

  if (count < max) return null;

  return NextResponse.json(
    {
      error:
        "That's a lot at once — give it an hour before sending more. If something's urgent, ring your builder.",
    },
    { status: 429 }
  );
}

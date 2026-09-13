import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { issueHouseLink } from "@/lib/owner/session";
import { z } from "zod";

export const dynamic = "force-dynamic";

/**
 * The house's share link.
 *
 *   POST { houseId }               issue a link, or replace the current one
 *   PUT  { houseId, ownerId, revoked }   cut one person off, or restore them
 *
 * The raw token is returned exactly once, at creation, because only its hash is
 * stored. He copies it straight into WhatsApp. If it is ever needed again — a
 * lost message, a new owner, a link that went somewhere it shouldn't — he
 * issues a fresh one, which revokes the old.
 */

const issue = z.object({ houseId: z.string().uuid() });
const setRevoked = z.object({
  houseId: z.string().uuid(),
  ownerId: z.string().uuid(),
  revoked: z.boolean(),
});

async function staff() {
  const session = await getServerSession(authOptions);
  return Boolean((session?.user as { id?: string } | undefined)?.id);
}

export async function POST(req: NextRequest) {
  if (!(await staff())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = issue.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  const house = await prisma.house.findUnique({
    where: { id: parsed.data.houseId },
    select: { id: true },
  });
  if (!house) return NextResponse.json({ error: "House not found" }, { status: 404 });

  const token = await issueHouseLink(house.id);
  const base = process.env.NEXTAUTH_URL ?? "";

  return NextResponse.json({ url: `${base}/h/${token}` }, { status: 201 });
}

export async function PUT(req: NextRequest) {
  if (!(await staff())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = setRevoked.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  // Removing one person does not disturb the others, and takes effect on their
  // next request rather than whenever a session happens to expire.
  await prisma.houseOwner.update({
    where: {
      houseId_ownerId: { houseId: parsed.data.houseId, ownerId: parsed.data.ownerId },
    },
    data: { revokedAt: parsed.data.revoked ? new Date() : null },
  });

  return NextResponse.json({ ok: true });
}

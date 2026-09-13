import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { sendAccessLink } from "@/lib/auth/owner-invite";
import { z } from "zod";

export const dynamic = "force-dynamic";

/**
 * Managing who can see a house.
 *
 *   POST  { ownerId }            send or re-send their access link
 *   PATCH { ownerId, email }     set or correct an owner's email
 *   PUT   { ownerId, revoked }   revoke or restore access
 *
 * Re-sending is meant to be routine. "I've lost the email", a new phone, a
 * partner who never got added — all of it should be one tap for him rather than
 * a support conversation. Each new link invalidates the last, so this is also
 * how a link that reached the wrong inbox gets shut off.
 */

const send = z.object({ ownerId: z.string().uuid(), houseId: z.string().uuid() });
const setEmail = z.object({
  ownerId: z.string().uuid(),
  email: z.string().email(),
});
const setRevoked = z.object({
  ownerId: z.string().uuid(),
  houseId: z.string().uuid(),
  revoked: z.boolean(),
});

async function requireStaff() {
  const session = await getServerSession(authOptions);
  return (session?.user as { id?: string } | undefined)?.id ?? null;
}

export async function POST(req: NextRequest) {
  if (!(await requireStaff())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = send.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  const link = await prisma.houseOwner.findUnique({
    where: { houseId_ownerId: { houseId: parsed.data.houseId, ownerId: parsed.data.ownerId } },
    select: {
      revokedAt: true,
      owner: { select: { id: true, name: true, email: true, authUserId: true } },
      house: { select: { address: true } },
    },
  });
  if (!link) return NextResponse.json({ error: "Not linked to this house" }, { status: 404 });
  if (link.revokedAt) {
    return NextResponse.json(
      { error: "Their access is revoked. Restore it first, then send the link." },
      { status: 409 }
    );
  }
  if (!link.owner.email) {
    return NextResponse.json(
      { error: "Add an email address for them first — that's how they sign in." },
      { status: 400 }
    );
  }

  try {
    await sendAccessLink({
      email: link.owner.email,
      name: link.owner.name,
      houseAddress: link.house.address,
      // No auth user yet means they have never signed in, so this is an
      // invitation rather than a replacement link.
      firstTime: !link.owner.authUserId,
    });
  } catch (cause) {
    return NextResponse.json(
      { error: cause instanceof Error ? cause.message : "Couldn't send that link." },
      { status: 502 }
    );
  }

  return NextResponse.json({ sent: true, email: link.owner.email });
}

export async function PATCH(req: NextRequest) {
  if (!(await requireStaff())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = setEmail.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "That doesn't look like an email address." }, { status: 400 });
  }

  const email = parsed.data.email.trim().toLowerCase();
  const clash = await prisma.owner.findFirst({
    where: { email, NOT: { id: parsed.data.ownerId } },
    select: { id: true },
  });
  if (clash) {
    return NextResponse.json(
      { error: "Another owner already uses that address." },
      { status: 409 }
    );
  }

  await prisma.owner.update({ where: { id: parsed.data.ownerId }, data: { email } });
  return NextResponse.json({ ok: true, email });
}

export async function PUT(req: NextRequest) {
  if (!(await requireStaff())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = setRevoked.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  // Revocation is the access boundary, not session expiry: every policy checks
  // revoked_at, so this takes effect on their very next request even if they
  // are already signed in.
  await prisma.houseOwner.update({
    where: { houseId_ownerId: { houseId: parsed.data.houseId, ownerId: parsed.data.ownerId } },
    data: { revokedAt: parsed.data.revoked ? new Date() : null },
  });

  return NextResponse.json({ ok: true });
}

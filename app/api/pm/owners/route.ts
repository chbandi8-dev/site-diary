import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

export const dynamic = "force-dynamic";

/**
 * Correcting an owner's details.
 *
 * Owners type their own name and email when they open their link, on a phone,
 * often one-handed — so a typo in an email address is not an edge case, it is
 * a Tuesday. Until now there was no way to fix one, and the symptom was the
 * worst kind: updates that look sent and land nowhere.
 *
 * The phone number is his to add, not theirs. Nothing asks an owner for it,
 * because nothing needs it — it exists so he can open WhatsApp with a message
 * already written, which is how he has always talked to them.
 */

const patch = z.object({
  ownerId: z.string().uuid(),
  houseId: z.string().uuid(),
  name: z.string().trim().min(1).max(120).optional(),
  email: z.string().trim().email().max(200).optional(),
  /** Empty string clears it. */
  phone: z.string().trim().max(40).optional(),
  notifyByEmail: z.boolean().optional(),
});

export async function PATCH(req: NextRequest) {
  if (!(await getServerSession(authOptions))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = patch.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Check the email address and try again." },
      { status: 400 }
    );
  }
  const { ownerId, houseId, name, email, phone, notifyByEmail } = parsed.data;

  // Reachable only through a house he is actually looking at, so this cannot
  // be used to walk the owners table by id.
  const link = await prisma.houseOwner.findFirst({
    where: { houseId, ownerId },
    select: { ownerId: true },
  });
  if (!link) {
    return NextResponse.json({ error: "That person isn't on this house." }, { status: 404 });
  }

  try {
    const owner = await prisma.owner.update({
      where: { id: ownerId },
      data: {
        ...(name !== undefined ? { name } : {}),
        ...(email !== undefined ? { email: email.toLowerCase() } : {}),
        ...(phone !== undefined ? { phone: phone || null } : {}),
        ...(notifyByEmail !== undefined ? { notifyByEmail } : {}),
      },
      select: { id: true, name: true, email: true, phone: true, notifyByEmail: true },
    });
    return NextResponse.json(owner);
  } catch (cause) {
    const clash =
      typeof cause === "object" && cause !== null && (cause as { code?: string }).code === "P2002";
    return NextResponse.json(
      {
        error: clash
          ? "Someone else is already using that email address. If they're the same person on another build, leave it as it is — one address can only belong to one record."
          : "Couldn't save that.",
      },
      { status: clash ? 409 : 500 }
    );
  }
}

/**
 * Adding somebody to a house that already exists.
 *
 * A name is enough, and usually all he has. The email arrives when they open
 * their link and register — `registerViewer` attaches it to this record rather
 * than making a second one — and the mobile is his to add if he has it, which
 * is what turns the WhatsApp button on.
 */
const add = z.object({
  houseId: z.string().uuid(),
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().email().max(200).optional().nullable(),
  phone: z.string().trim().max(40).optional().nullable(),
});

export async function POST(req: NextRequest) {
  if (!(await getServerSession(authOptions))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = add.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "A name is all it needs." }, { status: 400 });
  }
  const { houseId, name, phone } = parsed.data;
  const email = parsed.data.email ? parsed.data.email.toLowerCase() : null;

  const house = await prisma.house.findUnique({ where: { id: houseId }, select: { id: true } });
  if (!house) return NextResponse.json({ error: "House not found" }, { status: 404 });

  // With an address, the same couple building two houses is one person with
  // two builds. Without one there is nothing safe to match on — two different
  // people share a first name often enough — so it is a new record.
  const owner = email
    ? await prisma.owner.upsert({
        where: { email },
        update: { name, ...(phone ? { phone } : {}) },
        create: { name, email, phone: phone || null },
      })
    : await prisma.owner.create({ data: { name, phone: phone || null } });

  await prisma.houseOwner.upsert({
    where: { houseId_ownerId: { houseId: house.id, ownerId: owner.id } },
    update: { revokedAt: null },
    create: { houseId: house.id, ownerId: owner.id },
  });

  return NextResponse.json({ id: owner.id, name: owner.name }, { status: 201 });
}

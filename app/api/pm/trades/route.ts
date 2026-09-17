import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

export const dynamic = "force-dynamic";

/**
 * His address book of trades.
 *
 * Deliberately not a subcontractor portal. Trades will not sign into anything —
 * they are on a roof, they answer WhatsApp, and that is the whole extent of it.
 * This exists so a message about a specific house takes one tap instead of
 * scrolling a phone's contacts for "Dave Bricks 2".
 *
 * Stored rather than read live from the phone each time, for two reasons:
 * iPhone gives a web page no access to contacts at all, so a picker-only design
 * would work for half the people who might use this; and the app needs to know
 * what someone does, not just their number, to put the bricklayer at the top
 * when the brickwork is what is underway.
 */

const create = z.object({
  name: z.string().trim().min(1).max(120),
  company: z.string().trim().max(120).optional(),
  trade: z.string().trim().min(1).max(60),
  phone: z.string().trim().max(40).optional(),
  email: z.string().trim().email().max(200).optional().or(z.literal("")),
  notes: z.string().trim().max(500).optional(),
});

const update = create.partial().extend({
  id: z.string().uuid(),
  archived: z.boolean().optional(),
});

async function staff(): Promise<boolean> {
  return Boolean(await getServerSession(authOptions));
}

export async function POST(req: NextRequest) {
  if (!(await staff())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = create.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Check the details." }, { status: 400 });
  const { email, ...rest } = parsed.data;

  const trade = await prisma.trade.create({
    data: { ...rest, email: email || null },
    select: { id: true, name: true },
  });
  return NextResponse.json(trade, { status: 201 });
}

export async function PATCH(req: NextRequest) {
  if (!(await staff())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = update.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Check the details." }, { status: 400 });
  const { id, archived, email, ...rest } = parsed.data;

  const trade = await prisma.trade.update({
    where: { id },
    data: {
      ...rest,
      ...(email !== undefined ? { email: email || null } : {}),
      ...(archived !== undefined ? { archivedAt: archived ? new Date() : null } : {}),
    },
    select: { id: true },
  });
  return NextResponse.json(trade);
}

/**
 * Archived rather than deleted.
 *
 * A trade who did the waterproofing two years ago is part of the record of who
 * was on that house, and a defect found in year six is exactly when somebody
 * wants to know. Removing them from the list is a display concern, not a
 * reason to lose the name.
 */
export async function DELETE(req: NextRequest) {
  if (!(await staff())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  await prisma.trade.update({ where: { id }, data: { archivedAt: new Date() } });
  return NextResponse.json({ ok: true });
}

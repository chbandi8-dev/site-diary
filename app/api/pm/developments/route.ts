import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

export const dynamic = "force-dynamic";

/**
 * Estates and developments — a group of houses with one client behind them.
 *
 * Individual owner-builds belong to no development, and that is the majority of
 * the work. Nothing here changes how those behave; this exists for the other
 * kind, where one developer has eighteen lots and the end buyers may not exist
 * yet.
 */

const create = z.object({
  name: z.string().trim().min(1).max(160),
  client: z.string().trim().max(160).optional(),
  clientEmail: z.string().trim().email().max(200).optional().or(z.literal("")),
  clientPhone: z.string().trim().max(40).optional(),
  release: z.string().trim().max(60).optional(),
  notes: z.string().trim().max(1000).optional(),
});

/** Moving houses in and out, and setting their lot numbers. */
const assign = z.object({
  developmentId: z.string().uuid().nullable(),
  houses: z
    .array(z.object({ id: z.string().uuid(), lotNumber: z.string().trim().max(24).optional() }))
    .min(1)
    .max(200),
});

async function staff(): Promise<boolean> {
  return Boolean(await getServerSession(authOptions));
}

export async function POST(req: NextRequest) {
  if (!(await staff())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = create.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Check the details." }, { status: 400 });
  const { clientEmail, ...rest } = parsed.data;

  const development = await prisma.development.create({
    data: { ...rest, clientEmail: clientEmail || null },
    select: { id: true, name: true },
  });
  return NextResponse.json(development, { status: 201 });
}

export async function PATCH(req: NextRequest) {
  if (!(await staff())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();

  // Two shapes on one route: editing a development, and moving houses between
  // them. Split by which key is present rather than by two near-identical
  // endpoints.
  if ("houses" in body) {
    const parsed = assign.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

    for (const house of parsed.data.houses) {
      await prisma.house.update({
        where: { id: house.id },
        data: {
          developmentId: parsed.data.developmentId,
          // Clearing the development clears the lot with it: a lot number
          // means nothing once a house is standing on its own again.
          lotNumber: parsed.data.developmentId ? house.lotNumber || null : null,
        },
      });
    }
    return NextResponse.json({ moved: parsed.data.houses.length });
  }

  const parsed = create.partial().extend({ id: z.string().uuid() }).safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Check the details." }, { status: 400 });
  const { id, clientEmail, ...rest } = parsed.data;

  const development = await prisma.development.update({
    where: { id },
    data: { ...rest, ...(clientEmail !== undefined ? { clientEmail: clientEmail || null } : {}) },
    select: { id: true },
  });
  return NextResponse.json(development);
}

/**
 * Archived, never deleted.
 *
 * The houses survive either way — the relation nulls rather than cascades — but
 * an estate that built forty homes is a record of who did what and when, and
 * that matters long after the last lot settles.
 */
export async function DELETE(req: NextRequest) {
  if (!(await staff())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  await prisma.development.update({ where: { id }, data: { archivedAt: new Date() } });
  return NextResponse.json({ ok: true });
}

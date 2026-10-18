import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

export const dynamic = "force-dynamic";

/**
 * Moving an inspection along: booked, passed, failed, rebooked.
 *
 * A pass or a fail stamps when the result came in. Rebooking a failed one
 * clears that result and keeps the note, so what went wrong is still in front
 * of him when he rings the certifier.
 */

const patch = z.object({
  status: z.enum(["to_book", "booked", "passed", "failed"]).optional(),
  /** YYYY-MM-DD, or null to clear. */
  bookedFor: z.string().date().nullable().optional(),
  notes: z.string().trim().max(400).nullable().optional(),
});

async function guard() {
  return Boolean(await getServerSession(authOptions));
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  if (!(await guard())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = patch.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const { status, bookedFor, notes } = parsed.data;

  const found = await prisma.inspection.findUnique({ where: { id: params.id }, select: { id: true } });
  if (!found) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const decided = status === "passed" || status === "failed";
  await prisma.inspection.update({
    where: { id: params.id },
    data: {
      ...(status ? { status } : {}),
      ...(status ? { resultAt: decided ? new Date() : null } : {}),
      ...(bookedFor !== undefined
        ? { bookedFor: bookedFor ? new Date(`${bookedFor}T00:00:00.000Z`) : null }
        : {}),
      ...(notes !== undefined ? { notes: notes || null } : {}),
    },
  });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  if (!(await guard())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await prisma.inspection.deleteMany({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}

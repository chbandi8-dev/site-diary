import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

export const dynamic = "force-dynamic";

/**
 * His private column of the site diary.
 *
 * Deliberately its own table rather than a flag on `updates`: a mis-set column
 * can leak, a table that grants homeowners nothing cannot. See
 * supabase/migrations/0001_lockdown.sql — no owner-facing code path reads this,
 * and `lib/db/owner.ts` has no function that touches it.
 *
 * This exists because without it he hesitates before logging anything at all,
 * and hesitation is what kills the habit. But see the UI copy: these are
 * discoverable in a dispute, so they need to read as a site diary, not as
 * venting.
 */

const create = z.object({
  houseId: z.string().uuid(),
  body: z.string().trim().min(1).max(4000),
});

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = create.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  const house = await prisma.house.findUnique({
    where: { id: parsed.data.houseId },
    select: { id: true },
  });
  if (!house) return NextResponse.json({ error: "House not found" }, { status: 404 });

  const note = await prisma.internalNote.create({
    data: { houseId: house.id, body: parsed.data.body, authorId: userId },
    select: { id: true, body: true, createdAt: true },
  });

  return NextResponse.json(note, { status: 201 });
}

export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!(session?.user as { id?: string } | undefined)?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  await prisma.internalNote.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}

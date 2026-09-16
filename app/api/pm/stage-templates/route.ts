import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

export const dynamic = "force-dynamic";

/**
 * The standard stage list, which every new house is built from.
 *
 * Editing it changes nothing about houses already underway. That separation is
 * deliberate and worth keeping: each house copies the list at the moment it is
 * created, name and phase included, so a change here cannot rewrite what a
 * finished build showed its owner two years ago.
 *
 * Which also means adding a stage here does not add it to the twenty-five
 * houses already running. Those take it one at a time, if they need it at all.
 */

const create = z.object({
  name: z.string().trim().min(1).max(120),
  phase: z.string().trim().min(1).max(60),
  afterId: z.string().uuid().optional(),
  typicalDays: z.number().int().min(0).max(400).optional(),
  isPaymentMilestone: z.boolean().default(false),
});

/** Stable, readable, and unique — the column requires it. */
function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
}

export async function POST(req: NextRequest) {
  if (!(await getServerSession(authOptions))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = create.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const { name, phase, afterId, typicalDays, isPaymentMilestone } = parsed.data;

  const templates = await prisma.stageTemplate.findMany({
    select: { id: true, position: true },
    orderBy: { position: "asc" },
  });

  const after = afterId ? templates.find((t) => t.id === afterId) : undefined;
  if (afterId && !after) {
    return NextResponse.json({ error: "That stage isn't in the list." }, { status: 400 });
  }
  const insertAt = after ? after.position + 1 : (templates[templates.length - 1]?.position ?? 0) + 1;

  // Template positions are integers with a unique constraint, so inserting in
  // the middle means shifting everything after it. Done highest-first, because
  // ascending order would collide with the row it is about to vacate.
  const toShift = templates
    .filter((t) => t.position >= insertAt)
    .sort((a, b) => b.position - a.position);

  let slug = slugify(name);
  if (!slug) slug = `stage-${Date.now()}`;
  const taken = await prisma.stageTemplate.findUnique({ where: { slug }, select: { id: true } });
  if (taken) slug = `${slug}-${Date.now().toString(36).slice(-4)}`;

  try {
    const template = await prisma.$transaction(async (tx) => {
      for (const t of toShift) {
        await tx.stageTemplate.update({
          where: { id: t.id },
          data: { position: t.position + 1 },
        });
      }
      return tx.stageTemplate.create({
        data: {
          name,
          slug,
          phase,
          position: insertAt,
          typicalDays: typicalDays ?? null,
          isPaymentMilestone,
        },
        select: { id: true, name: true, position: true },
      });
    });

    return NextResponse.json(template, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Couldn't add that one. Try a different name." }, { status: 409 });
  }
}

/**
 * Removing one from the standard list.
 *
 * Houses already created keep theirs — the name and phase are copied onto each
 * house rather than read through a link, so nothing already underway changes.
 * Only future houses stop getting it.
 */
export async function DELETE(req: NextRequest) {
  if (!(await getServerSession(authOptions))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  const template = await prisma.stageTemplate.findUnique({
    where: { id },
    select: { id: true, name: true, _count: { select: { houseStages: true } } },
  });
  if (!template) return NextResponse.json({ ok: true });

  await prisma.stageTemplate.delete({ where: { id: template.id } });

  return NextResponse.json({
    ok: true,
    // Said back, because "will this wreck my live houses" is the question
    // anyone deleting from a template list is actually asking.
    keptOnExistingHouses: template._count.houseStages,
  });
}

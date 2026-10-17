import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createHouse, NoStageTemplates } from "@/lib/create-house";
import { refreshQuietly } from "@/lib/programme";
import { parsePastedHouses, planMerge, planStages, sentence, type MergePlan } from "@/lib/paste-import";
import { z } from "zod";

export const dynamic = "force-dynamic";

/**
 * Putting a pasted list of houses on the books.
 *
 * Two calls with one meaning: `commit: false` reads the text and reports what
 * it WOULD do, `commit: true` does it. Both parse the text afresh on the
 * server, so what is saved is always what the same words produce — never
 * whatever a client says the preview contained.
 *
 * A house whose address is already on the books is never duplicated. Pasting
 * onto it fills in what is missing — a mobile, storeys, a handover that was never
 * set — and leaves alone anything already there that an owner can read. Pasting
 * the same list twice changes nothing the second time. See `planMerge`.
 */

const body = z.object({
  text: z.string().trim().min(10).max(30_000),
  commit: z.boolean().default(false),
});

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = body.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Paste the list first." }, { status: 400 });
  }

  const templates = await prisma.stageTemplate.findMany({
    select: { name: true },
    orderBy: { position: "asc" },
  });
  const stageNames = templates.map((t) => t.name);

  const houses = parsePastedHouses(parsed.data.text);
  if (houses.length === 0) {
    return NextResponse.json(
      {
        error:
          "Couldn't find a house in that. Each one starts with its street address on its own line — 12 Example Street, Parramatta.",
      },
      { status: 422 }
    );
  }

  const existing = await prisma.house.findMany({
    relationLoadStrategy: "join",
    where: { OR: houses.map((h) => ({ address: { equals: h.address, mode: "insensitive" as const } })) },
    select: {
      id: true,
      address: true,
      storeys: true,
      handoverTo: true,
      targetHandover: true,
      waitingOn: true,
      nextWeek: true,
      owners: {
        where: { revokedAt: null },
        select: { owner: { select: { id: true, name: true, phone: true } } },
      },
    },
  });
  const have = new Map(existing.map((h) => [h.address.toLowerCase(), h]));

  const rows = houses.map((h) => {
    const { plan, unmatched } = planStages(h.status, h.next, stageNames);
    const there = have.get(h.address.toLowerCase());
    const merge: (MergePlan & { houseId: string }) | null = there
      ? {
          houseId: there.id,
          ...planMerge(h, {
            id: there.id,
            storeys: there.storeys,
            handoverTo: there.handoverTo,
            waitingOn: there.waitingOn,
            nextWeek: there.nextWeek,
            owners: there.owners.map((o) => ({
              ownerId: o.owner.id,
              name: o.owner.name,
              phone: o.owner.phone,
            })),
          }),
        }
      : null;
    return { ...h, plan, unmatched, duplicate: Boolean(there), merge };
  });

  if (!parsed.data.commit) return NextResponse.json({ houses: rows });

  const created: { id: string; address: string }[] = [];
  const updated: { id: string; address: string; changes: string[] }[] = [];
  const skipped: string[] = [];

  for (const h of rows) {
    if (h.duplicate && h.merge) {
      if (h.merge.changes.length === 0) {
        skipped.push(h.address);
        continue;
      }
      try {
        const m = h.merge;
        const now = new Date();
        const there = have.get(h.address.toLowerCase())!;
        const data: Record<string, unknown> = {};
        if (m.storeys) data.storeys = m.storeys;
        if (m.handover) {
          data.handoverFrom = new Date(`${m.handover.from}T00:00:00.000Z`);
          data.handoverTo = new Date(`${m.handover.to}T00:00:00.000Z`);
          // The end of the window is the promise, unless one was already made.
          if (!there.targetHandover) data.targetHandover = data.handoverTo;
        }
        if (m.waitingOn) data.waitingOn = m.waitingOn;
        if (m.nextWeek) {
          data.nextWeek = m.nextWeek;
          data.nextWeekSetAt = now;
        }
        if (Object.keys(data).length > 0) {
          await prisma.house.update({ where: { id: m.houseId }, data });
        }
        for (const p of m.phones) {
          await prisma.owner.update({ where: { id: p.ownerId }, data: { phone: p.phone } });
        }
        for (const o of m.newOwners) {
          const owner = await prisma.owner.create({ data: { name: o.name, phone: o.phone } });
          await prisma.houseOwner.create({ data: { houseId: m.houseId, ownerId: owner.id } });
        }
        if (m.handover) await refreshQuietly(m.houseId);
        updated.push({ id: m.houseId, address: h.address, changes: m.changes });
      } catch {
        skipped.push(h.address);
      }
      continue;
    }
    try {
      // The earliest stage mentioned is where the build is "up to": everything
      // before it is finished, which is the only sane reading of a render being
      // on and is his to adjust on the board.
      const house = await createHouse({
        address: h.address,
        suburb: h.suburb,
        storeys: h.storeys ?? 1,
        waitingOn: h.waitingOn,
        owners: h.owners.map((o) => ({ name: o.name, phone: o.phone })),
        currentStage: h.plan[0]?.stage ?? null,
        handoverFrom: h.handoverFrom,
        handoverTo: h.handoverTo,
      });

      const now = new Date();
      for (const p of h.plan) {
        await prisma.houseStage.updateMany({
          where: { houseId: house.id, name: p.stage },
          data: {
            status: p.status,
            startedAt: p.status === "scheduled" ? null : now,
            completedAt: p.status === "complete" ? now : null,
          },
        });
      }

      // The stages have just been set, so the due dates built when the house was
      // created are already out of date. No promised date, nothing to do.
      await refreshQuietly(house.id);

      if (h.next.length > 0) {
        await prisma.house.update({
          where: { id: house.id },
          data: { nextWeek: sentence(h.next), nextWeekSetAt: now },
        });
      }

      // Where it stood when it went on the books, in his words, for him only.
      // Kept rather than dropped: the status lines are the one part of the list
      // that is not a field, and "electrical rough-in done" is worth having.
      if (h.status.length > 0) {
        await prisma.internalNote.create({
          data: {
            houseId: house.id,
            authorId: userId,
            body: `Added from a pasted list. Status then: ${h.status.join("; ")}.`,
          },
        });
      }

      created.push({ id: house.id, address: house.address });
    } catch (cause) {
      if (cause instanceof NoStageTemplates) {
        return NextResponse.json({ error: cause.message }, { status: 409 });
      }
      skipped.push(h.address);
    }
  }

  return NextResponse.json({ created, updated, skipped });
}

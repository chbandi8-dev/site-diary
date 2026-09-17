import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createHouse, NoStageTemplates } from "@/lib/create-house";
import { z } from "zod";

export const dynamic = "force-dynamic";

/**
 * Carrying out the actions he ticked.
 *
 * Everything that arrives here has been on his screen and been approved, and
 * every field of it is re-validated anyway — a page left open on a phone in a
 * pocket is the most ordinary thing in the world, and nothing that came back
 * from a language model is trusted twice.
 *
 * Two rules this route enforces regardless of what was proposed:
 *
 * 1. An owner-facing update is ALWAYS created unsent. There is no flag the
 *    interpreter can set to make a message leave the building. He opens the
 *    house, reads it, and sends it — see `publishedAt: null` below.
 * 2. A stage is looked up by name WITHIN the house it was filed against, never
 *    by id from the request, so no amount of stale state can move a stage on
 *    somebody else's build.
 *
 * Each action is applied on its own and reports its own result. One bad action
 * out of five must not cost him the other four — he dictated them all at once
 * and would have no idea which had landed.
 */

const day = (value: string) => new Date(`${value}T00:00:00.000Z`);

const houseId = z.string().uuid();
const isoDay = z.string().date();

const payload = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("stage"),
    houseId,
    stage: z.string().trim().min(1).max(120),
    status: z.enum([
      "not_started",
      "scheduled",
      "in_progress",
      "on_hold",
      "complete",
      "not_applicable",
    ]),
  }),
  z.object({ kind: z.literal("note"), houseId, body: z.string().trim().min(1).max(4000) }),
  z.object({
    kind: z.literal("update"),
    houseId,
    body: z.string().trim().min(1).max(4000),
    updateKind: z.enum(["progress", "delay", "milestone", "weather", "message"]),
  }),
  z.object({
    kind: z.literal("waiting"),
    houseId,
    waitingOn: z.string().trim().max(200).nullable(),
    eta: isoDay.nullable(),
  }),
  z.object({ kind: z.literal("next_week"), houseId, body: z.string().trim().min(1).max(1000) }),
  z.object({
    kind: z.literal("wet_day"),
    houseId,
    date: isoDay,
    note: z.string().trim().max(200).nullable(),
  }),
  z.object({
    kind: z.literal("defect"),
    houseId,
    location: z.string().trim().max(120).nullable(),
    description: z.string().trim().min(1).max(600),
    target: isoDay.nullable(),
  }),
  z.object({
    kind: z.literal("house"),
    address: z.string().trim().min(3).max(200),
    suburb: z.string().trim().max(120).nullable(),
    storeys: z.union([z.literal(1), z.literal(2)]).nullable(),
    owners: z
      .array(
        z.object({
          name: z.string().trim().min(1).max(120),
          email: z.string().trim().max(200).nullable(),
        })
      )
      .max(2),
    currentStage: z.string().trim().max(120).nullable(),
    waitingOn: z.string().trim().max(200).nullable(),
    handoverFrom: isoDay.nullable(),
    handoverTo: isoDay.nullable(),
  }),
]);

const body = z.object({ actions: z.array(payload).min(1).max(20) });

type Payload = z.infer<typeof payload>;
type Outcome = { ok: true; done: string; houseId?: string } | { ok: false; error: string };

async function apply(action: Payload, userId: string): Promise<Outcome> {
  switch (action.kind) {
    case "stage": {
      const stage = await prisma.houseStage.findFirst({
        where: { houseId: action.houseId, name: action.stage },
        select: { id: true, name: true, startedAt: true },
      });
      if (!stage) return { ok: false, error: `${action.stage} isn't a stage on that house.` };

      const now = new Date();
      await prisma.houseStage.update({
        where: { id: stage.id },
        data: {
          status: action.status,
          startedAt: action.status === "in_progress" ? (stage.startedAt ?? now) : stage.startedAt,
          completedAt: action.status === "complete" ? now : null,
        },
      });
      return { ok: true, done: `${stage.name} marked`, houseId: action.houseId };
    }

    case "note": {
      const house = await prisma.house.findUnique({
        where: { id: action.houseId },
        select: { id: true },
      });
      if (!house) return { ok: false, error: "That house is gone." };
      await prisma.internalNote.create({
        data: { houseId: house.id, body: action.body, authorId: userId },
      });
      return { ok: true, done: "Private note saved", houseId: house.id };
    }

    case "update": {
      const house = await prisma.house.findUnique({
        where: { id: action.houseId },
        select: { id: true },
      });
      if (!house) return { ok: false, error: "That house is gone." };

      // Unsent, always. Nothing dictated reaches a homeowner without him
      // having read the words on a screen first.
      await prisma.update.create({
        data: {
          houseId: house.id,
          kind: action.updateKind,
          body: action.body,
          authorId: userId,
          occurredAt: new Date(),
          publishedAt: null,
        },
      });
      return { ok: true, done: "Update drafted — not sent", houseId: house.id };
    }

    case "waiting": {
      const house = await prisma.house.findUnique({
        where: { id: action.houseId },
        select: { id: true },
      });
      if (!house) return { ok: false, error: "That house is gone." };
      await prisma.house.update({
        where: { id: house.id },
        data: {
          waitingOn: action.waitingOn || null,
          waitingOnEta: action.eta ? day(action.eta) : null,
        },
      });
      return {
        ok: true,
        done: action.waitingOn ? "Waiting-on updated" : "Waiting-on cleared",
        houseId: house.id,
      };
    }

    case "next_week": {
      const house = await prisma.house.findUnique({
        where: { id: action.houseId },
        select: { id: true },
      });
      if (!house) return { ok: false, error: "That house is gone." };
      await prisma.house.update({
        where: { id: house.id },
        // Stamped so the dashboard can tell a look-ahead written this week from
        // one left over from a fortnight ago.
        data: { nextWeek: action.body, nextWeekSetAt: new Date() },
      });
      return { ok: true, done: "Next week written", houseId: house.id };
    }

    case "wet_day": {
      const house = await prisma.house.findUnique({
        where: { id: action.houseId },
        select: { id: true },
      });
      if (!house) return { ok: false, error: "That house is gone." };
      // One row per house per day, so saying it twice does not double-count an
      // extension of time.
      await prisma.weatherDay.upsert({
        where: { houseId_date: { houseId: house.id, date: day(action.date) } },
        update: { workLost: true, note: action.note || undefined, source: "manual" },
        create: {
          houseId: house.id,
          date: day(action.date),
          workLost: true,
          note: action.note || null,
          source: "manual",
        },
      });
      return { ok: true, done: "Wet day logged", houseId: house.id };
    }

    case "defect": {
      const house = await prisma.house.findUnique({
        where: { id: action.houseId },
        select: { id: true },
      });
      if (!house) return { ok: false, error: "That house is gone." };
      // Numbered per house, because that is how they get talked about on site.
      const count = await prisma.defect.count({ where: { houseId: house.id } });
      const defect = await prisma.defect.create({
        data: {
          houseId: house.id,
          reference: String(count + 1),
          location: action.location || null,
          description: action.description,
          raisedByOwner: false,
          targetAt: action.target ? day(action.target) : null,
        },
        select: { reference: true },
      });
      return { ok: true, done: `Defect ${defect.reference} added`, houseId: house.id };
    }

    case "house": {
      try {
        const house = await createHouse({
          address: action.address,
          suburb: action.suburb,
          storeys: action.storeys ?? 1,
          owners: action.owners,
          currentStage: action.currentStage,
          waitingOn: action.waitingOn,
          handoverFrom: action.handoverFrom,
          handoverTo: action.handoverTo,
        });
        return { ok: true, done: `${house.address} added`, houseId: house.id };
      } catch (cause) {
        if (cause instanceof NoStageTemplates) return { ok: false, error: cause.message };
        throw cause;
      }
    }
  }
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = body.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  const results: Outcome[] = [];
  for (const action of parsed.data.actions) {
    try {
      results.push(await apply(action, userId));
    } catch {
      // One failure does not cost him the rest. He dictated five things in one
      // breath and would have no way of telling which four had landed.
      results.push({ ok: false, error: "That one didn't save. Try it by hand." });
    }
  }

  return NextResponse.json({ results });
}

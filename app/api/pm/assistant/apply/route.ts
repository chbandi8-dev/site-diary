import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createHouse, NoStageTemplates } from "@/lib/create-house";
import { queue, ownersOf, deliverNow } from "@/lib/notify";
import { z } from "zod";
import { payload, type Payload } from "@/lib/assistant-payload";
import { refreshQuietly } from "@/lib/programme";

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

const body = z.object({ actions: z.array(payload).min(1).max(20) });

/** Set when the result is a message he still has to hand to WhatsApp. */
type WhatsApp = { message: string; recipients: { name: string; phone: string | null }[] };
type Outcome =
  | { ok: true; done: string; houseId?: string; whatsapp?: WhatsApp }
  | { ok: false; error: string };

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
      await refreshQuietly(action.houseId);
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

    case "owner": {
      // Checked against this house, so a stale screen cannot edit somebody who
      // is on a different build.
      const link = action.ownerId
        ? await prisma.houseOwner.findFirst({
            where: { houseId: action.houseId, ownerId: action.ownerId },
            select: { ownerId: true },
          })
        : null;
      if (action.ownerId && !link) return { ok: false, error: "That person isn't on this house." };

      try {
        if (link) {
          await prisma.owner.update({
            where: { id: link.ownerId },
            data: {
              ...(action.phone ? { phone: action.phone } : {}),
              ...(action.email ? { email: action.email.toLowerCase() } : {}),
            },
          });
          return { ok: true, done: `${action.name}'s details saved`, houseId: action.houseId };
        }
        const house = await prisma.house.findUnique({
          where: { id: action.houseId },
          select: { id: true },
        });
        if (!house) return { ok: false, error: "That house is gone." };
        const email = action.email ? action.email.toLowerCase() : null;
        const owner = email
          ? await prisma.owner.upsert({
              where: { email },
              update: { name: action.name, ...(action.phone ? { phone: action.phone } : {}) },
              create: { name: action.name, email, phone: action.phone },
            })
          : await prisma.owner.create({ data: { name: action.name, phone: action.phone } });
        await prisma.houseOwner.upsert({
          where: { houseId_ownerId: { houseId: house.id, ownerId: owner.id } },
          update: { revokedAt: null },
          create: { houseId: house.id, ownerId: owner.id },
        });
        return { ok: true, done: `${action.name} added`, houseId: house.id };
      } catch (cause) {
        const clash = (cause as { code?: string })?.code === "P2002";
        return {
          ok: false,
          error: clash ? "That email already belongs to someone else." : "That one didn't save.",
        };
      }
    }

    case "send": {
      const house = await prisma.house.findUnique({
        where: { id: action.houseId },
        select: { id: true, address: true },
      });
      if (!house) return { ok: false, error: "That house is gone." };

      // Only people actually on this house, whatever ids came in.
      const people = await prisma.houseOwner.findMany({
        where: { houseId: house.id, ownerId: { in: action.ownerIds }, revokedAt: null },
        select: { owner: { select: { name: true, phone: true } } },
      });

      // The same rules as sending from the house page: a delay is held back as a
      // draft so he can ring first, anything else goes on their page now. He has
      // read the words on the approval screen, which is what makes this his send.
      const publish = action.updateKind !== "delay";
      const now = new Date();
      const update = await prisma.update.create({
        data: {
          houseId: house.id,
          kind: action.updateKind,
          body: action.body,
          authorId: userId,
          occurredAt: now,
          publishedAt: publish ? now : null,
          publishedById: publish ? userId : null,
        },
        select: { id: true },
      });

      if (publish) {
        const recipients = await ownersOf(house.id);
        await queue(
          recipients.map((recipient) => ({
            recipient,
            dedupeKey: `update:${update.id}:${recipient.ownerId}`,
            subject: `${house.address} — today's update`,
            body: "",
            houseId: house.id,
            updateId: update.id,
          }))
        );
        await deliverNow();
      }

      return {
        ok: true,
        done: publish ? "Posted — now send it on WhatsApp" : "Saved as a draft — ring them, then send",
        houseId: house.id,
        whatsapp: {
          message: action.body,
          recipients: people.map((p) => ({ name: p.owner.name, phone: p.owner.phone })),
        },
      };
    }

    case "handover": {
      const house = await prisma.house.findUnique({
        where: { id: action.houseId },
        select: { id: true, handoverFrom: true, handoverTo: true, targetHandover: true },
      });
      if (!house) return { ok: false, error: "That house is gone." };
      const from = day(action.from);
      const to = day(action.to);
      const moved =
        house.handoverFrom?.getTime() !== from.getTime() || house.handoverTo?.getTime() !== to.getTime();
      await prisma.$transaction([
        prisma.house.update({ where: { id: house.id }, data: { handoverFrom: from, handoverTo: to } }),
        ...(moved
          ? [
              prisma.handoverForecast.create({
                data: { houseId: house.id, from, to, reason: "Set by voice" },
              }),
            ]
          : []),
      ]);
      // As the house screen does: the far end becomes the promise only if none
      // was made, and the programme is rebuilt from it. Nobody is emailed.
      await refreshQuietly(house.id, !house.targetHandover ? { target: to } : undefined);
      return { ok: true, done: "Handover date set", houseId: house.id };
    }

    case "inspection": {
      const house = await prisma.house.findUnique({
        where: { id: action.houseId },
        select: { id: true },
      });
      if (!house) return { ok: false, error: "That house is gone." };

      // The open one of this kind if there is one — "frame passed" should close
      // the frame inspection he booked, not start a second.
      const existing = await prisma.inspection.findFirst({
        where: {
          houseId: house.id,
          kind: action.inspectionKind,
          status: { not: "passed" },
          ...(action.inspectionKind === "other" && action.label
            ? { label: { equals: action.label, mode: "insensitive" as const } }
            : {}),
        },
        orderBy: { createdAt: "desc" },
        select: { id: true },
      });
      const decided = action.status === "passed" || action.status === "failed";
      const data = {
        status: action.status,
        bookedFor: action.date ? day(action.date) : undefined,
        resultAt: decided ? new Date() : null,
      };
      if (existing) {
        await prisma.inspection.update({ where: { id: existing.id }, data });
      } else {
        await prisma.inspection.create({
          data: {
            houseId: house.id,
            kind: action.inspectionKind,
            label: action.inspectionKind === "other" ? action.label : null,
            ...data,
          },
        });
      }
      return { ok: true, done: existing ? "Inspection updated" : "Inspection added", houseId: house.id };
    }

    case "house_status": {
      const house = await prisma.house.findUnique({
        where: { id: action.houseId },
        select: { id: true },
      });
      if (!house) return { ok: false, error: "That house is gone." };
      await prisma.house.update({
        where: { id: house.id },
        data: {
          status: action.status,
          handedOverAt: action.status === "handed_over" ? new Date() : null,
        },
      });
      return {
        ok: true,
        done: action.status === "handed_over" ? "Marked as handed over" : "House reopened",
        houseId: house.id,
      };
    }

    case "defect_done": {
      // Looked up within the house, so a stale screen cannot close somebody
      // else's defect. No email goes out from here, unlike ticking it by hand:
      // anything that tells an owner is a decision he takes on a screen.
      const defect = await prisma.defect.findFirst({
        where: { id: action.defectId, houseId: action.houseId },
        select: { id: true, reference: true },
      });
      if (!defect) return { ok: false, error: "That defect isn't on this house." };
      await prisma.defect.update({
        where: { id: defect.id },
        data: { status: "resolved", resolvedAt: new Date() },
      });
      return { ok: true, done: `Defect ${defect.reference ?? ""} fixed`.trim(), houseId: action.houseId };
    }

    case "trade": {
      await prisma.trade.create({
        data: {
          name: action.name,
          trade: action.trade,
          phone: action.phone,
          company: action.company,
          notes: action.notes,
        },
      });
      return { ok: true, done: `${action.name} added to your trades` };
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

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { forecast, backwardPlan, type ForecastStage } from "@/lib/forecast";
import { queue, ownersOf, deliverNow } from "@/lib/notify";
import { siteUrl } from "@/lib/site-url";
import { z } from "zod";

export const dynamic = "force-dynamic";

/**
 * Recalculating when the house will be finished.
 *
 * Two steps, deliberately. GET computes and shows him; POST saves it and, if he
 * says so, tells the owners. Nothing recalculates silently in the background,
 * because a handover date that moves on its own — with no human deciding it had
 * really moved — is how an owner finds out their date slipped from a robot.
 *
 * Applying records a StageEstimate row for every stage whose date actually
 * changed. That history is the answer to "you told me lock-up was March": it
 * shows what was estimated, when, and why it moved.
 */

async function load(houseId: string, overrideTarget?: Date) {
  const house = await prisma.house.findUnique({
    where: { id: houseId },
    select: {
      id: true,
      address: true,
      startDate: true,
      targetHandover: true,
      handoverFrom: true,
      handoverTo: true,
      stages: {
        select: {
          id: true,
          name: true,
          position: true,
          status: true,
          plannedDays: true,
          startedAt: true,
          completedAt: true,
          estimatedEnd: true,
        },
        orderBy: { position: "asc" },
      },
      _count: { select: { weatherDays: { where: { workLost: true } } } },
    },
  });
  if (!house) return null;

  const target = overrideTarget ?? house.targetHandover ?? null;

  const result = forecast({
    startDate: house.startDate,
    stages: house.stages as ForecastStage[],
    wetDaysLost: house._count.weatherDays,
  });

  // Only when a date has actually been committed to. Inventing a target so the
  // screen has something to show would produce a slip figure measured against
  // nothing, which is worse than no figure.
  const plan = target
    ? backwardPlan({
        target,
        stages: house.stages as ForecastStage[],
        forecast: result.stages,
        wetDaysLost: house._count.weatherDays,
        workingDaysElapsed: 0,
      })
    : null;

  return { house, result, plan };
}

export async function GET(req: NextRequest) {
  if (!(await getServerSession(authOptions))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const houseId = req.nextUrl.searchParams.get("houseId");
  if (!houseId) return NextResponse.json({ error: "houseId is required" }, { status: 400 });

  // Lets him try a date before committing to it — "what would we have to hit
  // to make March work" is the question, and it should not require saving a
  // date he has not agreed to yet.
  const trying = req.nextUrl.searchParams.get("target");
  const loaded = await load(
    houseId,
    trying ? new Date(`${trying}T00:00:00.000Z`) : undefined
  );
  if (!loaded) return NextResponse.json({ error: "House not found" }, { status: 404 });

  return NextResponse.json({
    stages: loaded.result.stages,
    handoverFrom: loaded.result.handoverFrom,
    handoverTo: loaded.result.handoverTo,
    basis: loaded.result.basis,
    target: loaded.house.targetHandover,
    plan: loaded.plan,
    current: {
      handoverFrom: loaded.house.handoverFrom,
      handoverTo: loaded.house.handoverTo,
    },
  });
}

const apply = z.object({
  houseId: z.string().uuid(),
  /** The contracted handover date, if he is setting or changing it. */
  targetHandover: z.string().date().optional(),
  reason: z.string().trim().max(300).optional(),
  /** Move the house's published handover window to the forecast one. */
  moveHandover: z.boolean().default(false),
  /** Email the owners that their window has changed. Only with moveHandover. */
  notifyOwners: z.boolean().default(false),
});

export async function POST(req: NextRequest) {
  if (!(await getServerSession(authOptions))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = apply.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const { houseId, reason, moveHandover, notifyOwners, targetHandover } = parsed.data;

  const loaded = await load(
    houseId,
    targetHandover ? new Date(`${targetHandover}T00:00:00.000Z`) : undefined
  );
  if (!loaded) return NextResponse.json({ error: "House not found" }, { status: 404 });
  const { house, result } = loaded;

  const moved = result.stages.filter((s) => s.movedFrom);

  const dueBy = new Map((loaded.plan?.targets ?? []).map((t) => [t.id, t.dueBy]));

  await prisma.$transaction(async (tx) => {
    if (targetHandover) {
      await tx.house.update({
        where: { id: house.id },
        data: { targetHandover: new Date(`${targetHandover}T00:00:00.000Z`) },
      });
    }

    for (const stage of result.stages) {
      if (!stage.estimatedEnd) continue;

      await tx.houseStage.update({
        where: { id: stage.id },
        data: {
          estimatedEnd: stage.estimatedEnd,
          // Stored so "what is due this week" across every house is one query
          // rather than twenty-five forecasts run on a dashboard render.
          ...(dueBy.has(stage.id) ? { dueBy: dueBy.get(stage.id) } : {}),
        },
      });

      // Only genuine movements are recorded. Writing a row every recalculation
      // would bury the three that matter under two hundred that do not.
      if (stage.movedFrom) {
        await tx.stageEstimate.create({
          data: {
            houseStageId: stage.id,
            estimatedEnd: stage.estimatedEnd,
            reason: reason || null,
          },
        });
      }
    }

    if (moveHandover && result.handoverFrom && result.handoverTo) {
      await tx.house.update({
        where: { id: house.id },
        data: { handoverFrom: result.handoverFrom, handoverTo: result.handoverTo },
      });
      await tx.handoverForecast.create({
        data: {
          houseId: house.id,
          from: result.handoverFrom,
          to: result.handoverTo,
          reason: reason || null,
          notifiedAt: notifyOwners ? new Date() : null,
        },
      });
    }
  });

  if (moveHandover && notifyOwners && result.handoverFrom && result.handoverTo) {
    const window = `${result.handoverFrom.toLocaleDateString("en-AU", {
      day: "numeric",
      month: "long",
    })} to ${result.handoverTo.toLocaleDateString("en-AU", {
      day: "numeric",
      month: "long",
      year: "numeric",
    })}`;

    const recipients = await ownersOf(house.id);
    await queue(
      recipients.map((recipient) => ({
        recipient,
        // Keyed on the window, so re-applying the same dates never emails
        // twice, but a genuine change always does.
        dedupeKey: `handover:${house.id}:${recipient.ownerId}:${result.handoverFrom!.toISOString().slice(0, 10)}:${result.handoverTo!.toISOString().slice(0, 10)}`,
        subject: `${house.address} — your handover window`,
        body: [
          `We've updated the handover window for your build. It's now ${window}.`,
          ``,
          reason ? `${reason}\n` : "",
          `This is our best estimate from where the build is now, not a fixed date — we'll tell you as soon as it changes again either way.`,
          ``,
          `${siteUrl()}/my`,
        ]
          .filter(Boolean)
          .join("\n"),
        houseId: house.id,
      }))
    );
    await deliverNow();
  }

  return NextResponse.json({
    ok: true,
    stagesUpdated: result.stages.length,
    moved: moved.length,
    handoverMoved: moveHandover,
  });
}

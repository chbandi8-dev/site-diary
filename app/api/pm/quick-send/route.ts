import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { queue, ownersOf } from "@/lib/notify";
import { z } from "zod";

/**
 * One-tap updates.
 *
 *   GET  /api/pm/quick-send?houseId=...   the buttons to show, for this house
 *   POST /api/pm/quick-send               send one
 *
 * The buttons are filtered by the house's current stage, so he never scrolls
 * past a waterproofing line to reach "slab poured".
 *
 * Templates whose `autoPublish` is false are saved as drafts rather than sent.
 * That is every delay template: a date moving backwards is a phone call, not a
 * notification, and an owner whose lease ends on the 10th should not learn from
 * their inbox that the house slipped to the 14th.
 */

type Slot = { name: string; label: string; options: string[] };

const sendRequest = z.object({
  houseId: z.string().uuid(),
  templateKey: z.string().min(1),
  slots: z.record(z.string()).default({}),
  photoIds: z.array(z.string().uuid()).max(12).default([]),
  /// Overrides autoPublish downward only — he can always choose to hold something.
  hold: z.boolean().default(false),
});

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const houseId = req.nextUrl.searchParams.get("houseId");
  if (!houseId) return NextResponse.json({ error: "houseId is required" }, { status: 400 });

  const activeStages = await prisma.houseStage.findMany({
    where: { houseId, status: { in: ["in_progress", "scheduled"] } },
    select: { template: { select: { slug: true } } },
  });
  const activeSlugs = activeStages
    .map((s) => s.template?.slug)
    .filter((s): s is string => Boolean(s));

  const templates = await prisma.messageTemplate.findMany({
    where: { active: true },
    orderBy: [{ category: "asc" }, { position: "asc" }],
  });

  // A template with no stages listed is always offered; one with stages is
  // offered only where it is relevant right now.
  const relevant = templates.filter(
    (t) => t.stageSlugs.length === 0 || t.stageSlugs.some((s) => activeSlugs.includes(s))
  );

  return NextResponse.json({
    templates: relevant.map((t) => ({
      key: t.key,
      label: t.label,
      category: t.category,
      kind: t.kind,
      slots: (t.slots as Slot[] | null) ?? [],
      wantsPhoto: t.wantsPhoto,
      sendsImmediately: t.autoPublish,
      preview: t.body,
    })),
  });
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = sendRequest.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const { houseId, templateKey, slots, photoIds, hold } = parsed.data;

  const [house, template] = await Promise.all([
    prisma.house.findUnique({ where: { id: houseId }, select: { id: true, address: true } }),
    prisma.messageTemplate.findUnique({ where: { key: templateKey } }),
  ]);
  if (!house) return NextResponse.json({ error: "House not found" }, { status: 404 });
  if (!template || !template.active) {
    return NextResponse.json({ error: "That message is no longer available" }, { status: 404 });
  }

  let body: string;
  try {
    body = render(template.body, (template.slots as Slot[] | null) ?? [], slots);
  } catch (cause) {
    return NextResponse.json(
      { error: cause instanceof Error ? cause.message : "Invalid choice" },
      { status: 400 }
    );
  }

  const publish = template.autoPublish && !hold;
  const now = new Date();

  const update = await prisma.$transaction(async (tx) => {
    const created = await tx.update.create({
      data: {
        houseId,
        kind: template.kind,
        body,
        authorId: userId,
        templateKey: template.key,
        occurredAt: now,
        publishedAt: publish ? now : null,
        publishedById: publish ? userId : null,
      },
      select: { id: true, publishedAt: true },
    });

    if (photoIds.length) {
      // Scoped to this house and to confirmed uploads, so a stale id from
      // another build cannot be attached to a published update.
      await tx.photo.updateMany({
        where: { id: { in: photoIds }, houseId, status: "ready", updateId: null },
        data: { updateId: created.id },
      });
    }

    return created;
  });

  let notified = 0;
  if (publish) {
    const recipients = await ownersOf(houseId);
    const queued = await queue(
      recipients.map((recipient) => ({
        recipient,
        // Keyed on the update, so a retry cannot send twice.
        dedupeKey: `update:${update.id}:${recipient.email}`,
        subject: subjectFor(template.kind, house.address),
        body,
        houseId,
        updateId: update.id,
      }))
    );
    notified = queued.length;
  }

  return NextResponse.json(
    {
      id: update.id,
      published: Boolean(update.publishedAt),
      notified,
      body,
      message: publish
        ? `Sent to ${notified} owner${notified === 1 ? "" : "s"}.`
        : "Saved as a draft. Nothing has been sent — send it once you've made the call.",
    },
    { status: 201 }
  );
}

/**
 * Fills {slot} placeholders from the template's own option list.
 *
 * Values are checked against the declared options rather than trusted. Without
 * this, the request body would be a direct write into text that gets emailed to
 * a client — one typo'd or malicious value and the builder appears to have sent
 * it himself.
 */
function render(body: string, declared: Slot[], given: Record<string, string>): string {
  let out = body;

  for (const slot of declared) {
    const value = given[slot.name];
    if (!value) throw new Error(`Choose a value for "${slot.label}"`);
    if (!slot.options.includes(value)) {
      throw new Error(`"${value}" is not one of the options for "${slot.label}"`);
    }
    out = out.split(`{${slot.name}}`).join(value);
  }

  const unfilled = out.match(/\{(\w+)\}/);
  if (unfilled) throw new Error(`Missing a value for "${unfilled[1]}"`);
  return out;
}

function subjectFor(kind: string, address: string): string {
  switch (kind) {
    case "milestone":
      return `${address} — a milestone today`;
    case "delay":
      return `${address} — an update on timing`;
    case "weather":
      return `${address} — weather today`;
    case "message":
      return `${address} — a note from your builder`;
    default:
      return `${address} — today's update`;
  }
}

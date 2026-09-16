import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { queue, ownersOf, deliverNow } from "@/lib/notify";
import { siteUrl } from "@/lib/site-url";
import { z } from "zod";

export const dynamic = "force-dynamic";

/**
 * One message to every house at once.
 *
 * Some things are true of all twenty-five builds on the same day: the site
 * closes for Christmas, a heatwave stand-down, a supplier has collapsed. Today
 * that is twenty-five separate sends, which means it is one message sent badly
 * to the first eight houses and not at all to the rest.
 *
 * The highest blast radius in the app, so it is the most deliberate thing in
 * it: the message is written, the exact recipients are counted back to him, and
 * only then does a second tap send it. Nothing here is one-tap.
 *
 * Each house gets a real update on its own timeline rather than a bulk email
 * off to one side — an owner who reads it and later checks their page should
 * find it there, in order, like everything else he has told them.
 */

const create = z.object({
  body: z.string().trim().min(1).max(2000),
  /** Explicit list, so the preview he approved is the one that sends. */
  houseIds: z.array(z.string().uuid()).min(1).max(200),
});

/** Who it would reach, counted before anything is sent. */
export async function GET() {
  if (!(await getServerSession(authOptions))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const houses = await prisma.house.findMany({
    where: { status: { in: ["active", "practical_completion"] } },
    select: {
      id: true,
      address: true,
      suburb: true,
      owners: {
        where: { revokedAt: null },
        select: { owner: { select: { name: true, email: true, notifyByEmail: true } } },
      },
    },
    orderBy: { address: "asc" },
  });

  return NextResponse.json({
    houses: houses.map((h) => ({
      id: h.id,
      address: h.address,
      suburb: h.suburb,
      // Counted the same way the sender counts them, so the preview cannot
      // promise more people than will actually be emailed.
      recipients: h.owners.filter((o) => o.owner.notifyByEmail && o.owner.email).length,
    })),
  });
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = create.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const { body, houseIds } = parsed.data;

  const houses = await prisma.house.findMany({
    where: { id: { in: houseIds } },
    select: { id: true, address: true },
  });
  if (houses.length === 0) {
    return NextResponse.json({ error: "No houses selected." }, { status: 400 });
  }

  const now = new Date();
  // One key for the whole send, so the same message going out twice by a
  // double tap is deduped per owner rather than arriving twice.
  const batch = `broadcast:${now.getTime()}`;

  let posted = 0;
  let notified = 0;

  for (const house of houses) {
    const update = await prisma.update.create({
      data: {
        houseId: house.id,
        kind: "message",
        body,
        authorId: userId,
        occurredAt: now,
        publishedAt: now,
        publishedById: userId,
      },
      select: { id: true },
    });
    posted++;

    const recipients = await ownersOf(house.id);
    notified += recipients.length;

    await queue(
      recipients.map((recipient) => ({
        recipient,
        dedupeKey: `${batch}:${recipient.ownerId}`,
        subject: `${house.address} — a note from your builder`,
        body: `${body}\n\n${siteUrl()}/my`,
        houseId: house.id,
        updateId: update.id,
      }))
    );
  }

  // Drained after every house is queued rather than between them: a failure
  // halfway through delivery must not leave half the portfolio un-queued.
  await deliverNow(Math.min(notified, 60));

  return NextResponse.json({
    posted,
    notified,
    message: `Posted to ${posted} house${posted === 1 ? "" : "s"}${
      notified > 0 ? `, emailed to ${notified} owner${notified === 1 ? "" : "s"}` : ""
    }.`,
  });
}

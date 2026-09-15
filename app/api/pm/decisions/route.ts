import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { queue, ownersOf } from "@/lib/notify";
import { z } from "zod";

export const dynamic = "force-dynamic";

/**
 * Things he needs the owner to choose.
 *
 * The timestamps are the whole point. Owners routinely hold a build up on a
 * tile selection and then attribute the delay to the builder — "asked on the
 * 3rd, answered on the 21st" is the answer to that, and it only exists if the
 * asking was recorded rather than said on the phone.
 *
 * `consequence` is shown to the owner verbatim. A deadline with nothing
 * attached is a suggestion; one that says what slips is a decision.
 */

const create = z.object({
  houseId: z.string().uuid(),
  question: z.string().trim().min(1).max(300),
  detail: z.string().trim().max(2000).optional(),
  options: z.array(z.string().trim().min(1).max(120)).max(8).optional(),
  dueDate: z.string().date().optional(),
  consequence: z.string().trim().max(300).optional(),
});

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!(session?.user as { id?: string } | undefined)?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = create.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const { houseId, dueDate, options, ...rest } = parsed.data;

  const house = await prisma.house.findUnique({
    where: { id: houseId },
    select: { id: true, address: true },
  });
  if (!house) return NextResponse.json({ error: "House not found" }, { status: 404 });

  const decision = await prisma.decision.create({
    data: {
      houseId,
      ...rest,
      options: options?.length ? options : undefined,
      dueDate: dueDate ? new Date(dueDate) : undefined,
    },
    select: { id: true, question: true },
  });

  // Sent immediately rather than held: unlike a delay, this is good news in
  // disguise — it is the owner being given time to decide rather than being
  // told afterwards that they held things up.
  const recipients = await ownersOf(houseId);
  await queue(
    recipients.map((recipient) => ({
      recipient,
      dedupeKey: `decision:${decision.id}:${recipient.ownerId}`,
      subject: `${house.address} — we need a decision from you`,
      body: [
        decision.question,
        rest.detail ? `\n${rest.detail}` : "",
        dueDate
          ? `\nWe need this by ${new Date(dueDate).toLocaleDateString("en-AU", {
              weekday: "long",
              day: "numeric",
              month: "long",
            })}.`
          : "",
        rest.consequence ? `\n${rest.consequence}` : "",
      ]
        .filter(Boolean)
        .join("\n"),
      houseId,
    }))
  );

  return NextResponse.json(decision, { status: 201 });
}

export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!(session?.user as { id?: string } | undefined)?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  // Withdrawn, not deleted — the record that it was asked is the valuable part.
  await prisma.decision.update({ where: { id }, data: { status: "withdrawn" } });
  return NextResponse.json({ ok: true });
}

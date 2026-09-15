import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { draftUpdate } from "@/lib/draft";
import { z } from "zod";

export const dynamic = "force-dynamic";

/**
 * Drafts an owner-facing update from what he said out loud.
 *
 * Returns a draft — it never sends. Nothing generated reaches a client without
 * him reading it first: one invented date in writing is a contractual problem,
 * and it is his name on the message.
 */

const body = z.object({
  houseId: z.string().uuid(),
  transcript: z.string().trim().min(3).max(4000),
});

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!(session?.user as { id?: string } | undefined)?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = body.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Nothing to write up yet." }, { status: 400 });
  }

  const house = await prisma.house.findUnique({
    where: { id: parsed.data.houseId },
    select: {
      address: true,
      stages: {
        where: { status: "in_progress" },
        select: { name: true },
        orderBy: { position: "asc" },
      },
    },
  });
  if (!house) return NextResponse.json({ error: "House not found" }, { status: 404 });

  try {
    const draft = await draftUpdate({
      transcript: parsed.data.transcript,
      address: house.address,
      stages: house.stages.map((s) => s.name),
    });

    if (draft.internalOnly) {
      return NextResponse.json({
        body: "",
        internalOnly: true,
        message:
          "That sounded like a note for yourself rather than for them. Save it under Your notes instead.",
      });
    }

    return NextResponse.json({ body: draft.body, internalOnly: false });
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "Couldn't write that up.";
    return NextResponse.json(
      {
        error: message.includes("ANTHROPIC_API_KEY")
          ? "Voice write-up isn't switched on yet. You can still type the update."
          : "Couldn't write that up — check your signal and try again.",
      },
      { status: 502 }
    );
  }
}

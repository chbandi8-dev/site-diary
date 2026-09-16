import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { readHouseFromSpeech } from "@/lib/intake";
import { z } from "zod";

export const dynamic = "force-dynamic";

/**
 * Interprets a spoken note into a form he can check.
 *
 * Writes nothing. That separation is the whole safety model: a mishearing here
 * costs him one correction on screen, where the alternative — creating the
 * house directly from speech — costs a build filed at the wrong address, with
 * photos and updates hanging off it before anyone notices.
 */

const body = z.object({ transcript: z.string().trim().min(3).max(4000) });

export async function POST(req: NextRequest) {
  if (!(await getServerSession(authOptions))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = body.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Say a bit more and try again." }, { status: 400 });
  }

  const [templates, houses] = await Promise.all([
    prisma.stageTemplate.findMany({
      select: { name: true },
      orderBy: { position: "asc" },
    }),
    // His own addresses are the best spelling reference there is: the same
    // street gets dictated more than once, and a suburb he actually builds in
    // beats any general list.
    prisma.house.findMany({
      select: { address: true, suburb: true },
      orderBy: { createdAt: "desc" },
      take: 60,
    }),
  ]);
  if (templates.length === 0) {
    return NextResponse.json(
      { error: "No stage templates in the database. Run the seed first." },
      { status: 409 }
    );
  }

  try {
    const draft = await readHouseFromSpeech({
      transcript: parsed.data.transcript,
      stageNames: templates.map((t) => t.name),
      knownAddresses: houses.map((h) =>
        h.suburb ? `${h.address}, ${h.suburb}` : h.address
      ),
    });

    if (!draft) {
      return NextResponse.json(
        { error: "Couldn't pick out an address. Try saying the street number and street name." },
        { status: 422 }
      );
    }

    // A duplicate address is almost always him re-dictating a house he already
    // has, so it is surfaced as a warning on the form rather than an error —
    // two houses can legitimately share a street name in different suburbs.
    const existing = await prisma.house.findFirst({
      where: { address: { equals: draft.address, mode: "insensitive" } },
      select: { id: true, address: true, suburb: true },
    });

    return NextResponse.json({ draft, existing });
  } catch (cause) {
    const missingKey = cause instanceof Error && cause.message.includes("ANTHROPIC_API_KEY");
    return NextResponse.json(
      {
        error: missingKey
          ? "Voice capture isn't configured yet — ANTHROPIC_API_KEY is missing. Type the details in instead."
          : "That didn't come back. Try again, or type the details in.",
      },
      { status: missingKey ? 503 : 502 }
    );
  }
}

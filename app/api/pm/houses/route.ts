import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { createHouse, NoStageTemplates } from "@/lib/create-house";
import { z } from "zod";

export const dynamic = "force-dynamic";

/**
 * Adding a house.
 *
 * Until now this only existed as a CSV import script, which is fine for the
 * first twenty-five and useless for the twenty-sixth — he is not opening a
 * terminal to add the job he won this morning.
 *
 * The creation itself lives in `lib/create-house.ts`, shared with the voice
 * assistant so both paths produce an identical build.
 */

const create = z.object({
  address: z.string().trim().min(3).max(200),
  suburb: z.string().trim().max(120).optional().nullable(),
  storeys: z.union([z.literal(1), z.literal(2)]).default(1),
  owners: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(120),
        email: z.string().trim().email().max(200).optional().nullable(),
      })
    )
    .max(2)
    .default([]),
  currentStage: z.string().trim().max(120).optional().nullable(),
  waitingOn: z.string().trim().max(200).optional().nullable(),
  waitingOnDate: z.string().date().optional().nullable(),
  handoverFrom: z.string().date().optional().nullable(),
  handoverTo: z.string().date().optional().nullable(),
  startDate: z.string().date().optional().nullable(),
});

export async function POST(req: NextRequest) {
  if (!(await getServerSession(authOptions))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = create.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Check the details and try again." }, { status: 400 });
  }
  const input = parsed.data;

  try {
    const house = await createHouse(input);
    return NextResponse.json(house, { status: 201 });
  } catch (cause) {
    if (cause instanceof NoStageTemplates) {
      return NextResponse.json({ error: cause.message }, { status: 409 });
    }
    throw cause;
  }
}


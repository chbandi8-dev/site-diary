import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

export const dynamic = "force-dynamic";

/**
 * Putting an inspection on a house.
 *
 * Booking is just a date and a status; there is nothing to fill in beyond which
 * inspection it is. For anything the list does not name he types what he calls
 * it, and that label is shown in place of the kind.
 */

const create = z.object({
  houseId: z.string().uuid(),
  kind: z.enum([
    "pre_pour_footings",
    "frame",
    "waterproofing",
    "stormwater",
    "vehicle_crossing",
    "final_occupation",
    "other",
  ]),
  label: z.string().trim().max(80).optional(),
  /** YYYY-MM-DD. With a date it is booked; without, it is still to book. */
  bookedFor: z.string().date().optional(),
});

export async function POST(req: NextRequest) {
  if (!(await getServerSession(authOptions))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const parsed = create.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const { houseId, kind, label, bookedFor } = parsed.data;

  const house = await prisma.house.findUnique({ where: { id: houseId }, select: { id: true } });
  if (!house) return NextResponse.json({ error: "House not found" }, { status: 404 });

  const inspection = await prisma.inspection.create({
    data: {
      houseId,
      kind,
      label: kind === "other" ? label || null : null,
      status: bookedFor ? "booked" : "to_book",
      bookedFor: bookedFor ? new Date(`${bookedFor}T00:00:00.000Z`) : null,
    },
    select: { id: true },
  });
  return NextResponse.json(inspection, { status: 201 });
}

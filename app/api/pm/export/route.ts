import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/**
 * Everything, as one file he can keep.
 *
 * The database holds the only copy of every house, every owner's details, and
 * every update, variation and defect on record — and it sits on a free tier
 * with limited recovery. Losing it would not be an inconvenience, it would be
 * the loss of the record a disputed claim depends on.
 *
 * Deliberately plain JSON rather than a database dump: it can be read by
 * anything, in ten years, without this application existing. A backup that can
 * only be restored by the system that produced it is a bet that the system
 * still runs when you need it.
 *
 * Photos and documents are not in here — they are in object storage, which is
 * separately durable. What is exported is the record that explains them: which
 * house, which stage, what was said about it.
 */
export async function GET() {
  if (!(await getServerSession(authOptions))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const houses = await prisma.house.findMany({
    orderBy: { address: "asc" },
    include: {
      owners: { include: { owner: true } },
      stages: { orderBy: { position: "asc" } },
      updates: {
        orderBy: { occurredAt: "asc" },
        include: {
          photos: {
            select: { id: true, key: true, caption: true, takenAt: true, origin: true },
          },
        },
      },
      decisions: { orderBy: { askedAt: "asc" } },
      variations: { orderBy: { createdAt: "asc" } },
      documents: { orderBy: { uploadedAt: "asc" } },
      defects: { orderBy: { raisedAt: "asc" } },
      weatherDays: { orderBy: { date: "asc" } },
      ownerReports: { orderBy: { createdAt: "asc" } },
      forecasts: { orderBy: { createdAt: "asc" } },
      internalNotes: { orderBy: { createdAt: "asc" } },
    },
  });

  // The append-only record behind variations and decisions. Worth more than
  // the rows it describes if either is ever argued about.
  const evidence = await prisma.evidenceEvent.findMany({ orderBy: { at: "asc" } });

  const stamp = new Date().toISOString().slice(0, 10);
  const payload = {
    exportedAt: new Date().toISOString(),
    // Lets a future reader tell how to interpret the shape without guessing.
    format: 1,
    counts: {
      houses: houses.length,
      updates: houses.reduce((n, h) => n + h.updates.length, 0),
      variations: houses.reduce((n, h) => n + h.variations.length, 0),
      defects: houses.reduce((n, h) => n + h.defects.length, 0),
    },
    houses,
    evidence,
  };

  return new NextResponse(JSON.stringify(payload, null, 2), {
    headers: {
      "Content-Type": "application/json",
      // Downloads rather than opening as a wall of text in the browser.
      "Content-Disposition": `attachment; filename="site-diary-${stamp}.json"`,
      "Cache-Control": "no-store",
    },
  });
}

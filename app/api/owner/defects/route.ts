import { NextRequest, NextResponse } from "next/server";
import { currentHouse, currentViewer } from "@/lib/owner/session";
import { createOwnerDefect, photoBelongsToHouse } from "@/lib/db/owner";
import { notifyStaffOfReport } from "@/lib/owner/notify-staff";
import { overLimit, wrongOrigin } from "@/lib/owner/guard";
import { z } from "zod";

export const dynamic = "force-dynamic";

/**
 * An owner adding to the defects list.
 *
 * They are walking the house with a phone, adding one item at a time. Making
 * them file a general "report" that he then retypes onto the punch list is two
 * people doing the same job, and their words get lost in the translation.
 *
 * House and author come from cookies this server set, never the request, so
 * nothing here can put an item on another build's list or in another person's
 * name.
 */

const body = z.object({
  description: z.string().trim().min(1).max(600),
  location: z.string().trim().max(120).optional(),
  photoId: z.string().uuid().optional(),
});

export async function POST(req: NextRequest) {
  if (wrongOrigin(req)) {
    return NextResponse.json({ error: "Request blocked." }, { status: 403 });
  }

  const access = await currentHouse();
  if (!access) {
    return NextResponse.json(
      { error: "That link has expired. Ask your builder for a new one." },
      { status: 401 }
    );
  }

  // Same budget as reports: a walk-through produces a lot of items in one
  // sitting, and each one emails him.
  const limited = await overLimit(access.houseId, "reports");
  if (limited) return limited;

  const viewer = await currentViewer(access.houseId);
  if (!viewer) {
    return NextResponse.json(
      { error: "Add your name and email first, so your builder knows who found it." },
      { status: 403 }
    );
  }

  const parsed = body.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Describe what needs attention." }, { status: 400 });
  }

  if (parsed.data.photoId && !(await photoBelongsToHouse(access.houseId, parsed.data.photoId))) {
    return NextResponse.json({ error: "That photo isn't from your build." }, { status: 400 });
  }

  const { defect, reportId } = await createOwnerDefect(access.houseId, viewer.id, parsed.data);

  await notifyStaffOfReport({
    reportId,
    houseId: access.houseId,
    kind: "maintenance",
    body: parsed.data.location
      ? `${parsed.data.location}: ${parsed.data.description}`
      : parsed.data.description,
    fromName: viewer.name,
  });

  return NextResponse.json({ id: defect.id, reference: defect.reference }, { status: 201 });
}

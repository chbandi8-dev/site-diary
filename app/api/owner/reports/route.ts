import { NextRequest, NextResponse } from "next/server";
import { currentHouse, currentViewer } from "@/lib/owner/session";
import { createReport, photoBelongsToHouse } from "@/lib/db/owner";
import { z } from "zod";
import { overLimit, wrongOrigin } from "@/lib/owner/guard";

export const dynamic = "force-dynamic";

/**
 * Someone raising a question, an issue, or maintenance.
 *
 * Registration is required first — not for security, but because a report with
 * nobody attached is one he cannot reply to, which is worse than no report.
 *
 * House and author both come from cookies this server set. Neither is read from
 * the request body, so nothing a caller sends can file a report against another
 * build or in another person's name.
 */

const body = z.object({
  kind: z.enum(["question", "issue", "maintenance"]),
  body: z.string().trim().min(1).max(4000),
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

  const limited = await overLimit(access.houseId, "reports");
  if (limited) return limited;

  const viewer = await currentViewer(access.houseId);
  if (!viewer) {
    return NextResponse.json(
      { error: "Add your name and email first, so your builder knows who to reply to." },
      { status: 403 }
    );
  }

  const parsed = body.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Please describe what you've noticed." }, { status: 400 });
  }

  // A photo may only be attached if it belongs to this house, so a report
  // cannot be used to pull an image out of somebody else's build.
  if (parsed.data.photoId && !(await photoBelongsToHouse(access.houseId, parsed.data.photoId))) {
    return NextResponse.json({ error: "That photo isn't from your build." }, { status: 400 });
  }

  const report = await createReport(access.houseId, viewer.id, parsed.data);

  return NextResponse.json(report, { status: 201 });
}

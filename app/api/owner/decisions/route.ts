import { NextRequest, NextResponse } from "next/server";
import { currentHouse, currentViewer } from "@/lib/owner/session";
import { answerDecision } from "@/lib/db/owner";
import { wrongOrigin } from "@/lib/owner/guard";
import { z } from "zod";

export const dynamic = "force-dynamic";

const body = z.object({
  decisionId: z.string().uuid(),
  answer: z.string().trim().min(1).max(1000),
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
  if (!(await currentViewer(access.houseId))) {
    return NextResponse.json(
      { error: "Add your name and email first, so your builder knows who chose." },
      { status: 403 }
    );
  }

  const parsed = body.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Please choose or write an answer." }, { status: 400 });
  }

  // The house comes from the link, never the request, so an answer cannot be
  // filed against somebody else's build.
  const ok = await answerDecision(access.houseId, parsed.data.decisionId, parsed.data.answer);
  if (!ok) {
    return NextResponse.json(
      { error: "That's already been answered, or it's no longer needed." },
      { status: 409 }
    );
  }

  return NextResponse.json({ ok: true });
}

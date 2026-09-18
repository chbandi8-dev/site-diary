import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { issueBoardLink, revokeBoardLink } from "@/lib/board/session";
import { siteUrl } from "@/lib/site-url";
import { z } from "zod";

export const dynamic = "force-dynamic";

/**
 * Making and revoking a board link.
 *
 * The raw token is returned exactly once, on creation, and never again — only
 * its hash is kept. Losing it costs a new link; storing it in a form he could
 * re-read would mean a database dump was a set of working keys.
 */

const create = z.object({
  label: z.string().trim().min(1).max(80),
  developmentId: z.string().uuid().nullable().optional(),
});

export async function POST(req: NextRequest) {
  if (!(await getServerSession(authOptions))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = create.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Give it a name first." }, { status: 400 });
  }

  const token = await issueBoardLink({
    label: parsed.data.label,
    developmentId: parsed.data.developmentId ?? null,
  });

  return NextResponse.json({ url: `${siteUrl()}/b/${token}` }, { status: 201 });
}

export async function DELETE(req: NextRequest) {
  if (!(await getServerSession(authOptions))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  await revokeBoardLink(id);
  return NextResponse.json({ ok: true });
}

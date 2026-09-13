import { NextRequest, NextResponse } from "next/server";
import { currentHouse, registerViewer } from "@/lib/owner/session";
import { z } from "zod";

export const dynamic = "force-dynamic";

/**
 * Someone on this house telling us who they are, so we can email them.
 *
 * Not a sign-up. They already have access — the link gave them that — and this
 * changes nothing about what they can see. It only turns the page from
 * something they have to remember to check into something that tells them.
 *
 * The house comes from the link cookie, never from the request body. Nothing a
 * caller sends can attach them to a different build.
 */

const body = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().email().max(200),
});

export async function POST(req: NextRequest) {
  const access = await currentHouse();
  if (!access) {
    return NextResponse.json(
      { error: "That link has expired. Ask your builder for a new one." },
      { status: 401 }
    );
  }

  const parsed = body.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Please add your name and a valid email address." },
      { status: 400 }
    );
  }

  try {
    const result = await registerViewer(access.houseId, parsed.data.name, parsed.data.email);

    if ("error" in result) {
      return NextResponse.json(
        { error: "That address has been removed from this build. Please speak to your builder." },
        { status: 403 }
      );
    }

    // The owner id is not returned: it is the value of the identity cookie, and
    // handing it back to the page serves nothing.
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "That didn't save. Try again." }, { status: 500 });
  }
}

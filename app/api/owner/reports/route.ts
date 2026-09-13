import { NextRequest, NextResponse } from "next/server";
import { createOwnerClient } from "@/lib/supabase/server";
import { z } from "zod";

export const dynamic = "force-dynamic";

/**
 * An owner raising something.
 *
 * Goes through the submit_owner_report function rather than an insert. Owners
 * hold no write grant on any table: row-level security can restrict which rows
 * an insert touches, but not which columns, so a direct grant would also let
 * them set a status or a reply. The function is the whole owner-side write
 * surface, and it re-checks the house and the photo itself.
 */

const body = z.object({
  houseId: z.string().uuid(),
  kind: z.enum(["question", "issue", "maintenance"]),
  body: z.string().trim().min(1).max(4000),
  photoId: z.string().uuid().optional(),
});

export async function POST(req: NextRequest) {
  const parsed = body.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Please describe what you've noticed." }, { status: 400 });
  }

  const supabase = createOwnerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Please sign in again." }, { status: 401 });

  const { data, error } = await supabase.rpc("submit_owner_report", {
    p_house_id: parsed.data.houseId,
    p_kind: parsed.data.kind,
    p_body: parsed.data.body,
    p_photo_id: parsed.data.photoId ?? null,
  });

  if (error) {
    return NextResponse.json(
      { error: "That didn't send. Give it another go, or call your builder." },
      { status: 400 }
    );
  }

  return NextResponse.json({ id: data }, { status: 201 });
}

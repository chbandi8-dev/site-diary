import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";
import { randomUUID } from "crypto";
import { createOwnerClient } from "@/lib/supabase/server";
import { photoKey, putObject } from "@/lib/r2";

export const dynamic = "force-dynamic";

/**
 * A photo attached to something an owner is reporting.
 *
 * Processed on the server rather than in the browser. Owner uploads are rare —
 * a handful a week against his hundreds — so the cost is irrelevant, and doing
 * it here means the EXIF block is verifiably gone rather than gone if their
 * browser cooperated. `.rotate()` applies the orientation tag before it is
 * dropped, which is what stops portrait photos arriving sideways.
 *
 * Access is established by reading the house through the owner's own client:
 * row-level security returns nothing unless it is their build, so a successful
 * read *is* the authorisation check.
 */

const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

export async function POST(req: NextRequest) {
  const supabase = createOwnerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Please sign in again." }, { status: 401 });

  const form = await req.formData();
  const houseId = form.get("houseId");
  const file = form.get("file");

  if (typeof houseId !== "string" || !(file instanceof File)) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json({ error: "That photo is too large." }, { status: 413 });
  }

  const { data: house } = await supabase
    .from("houses")
    .select("id")
    .eq("id", houseId)
    .maybeSingle();
  if (!house) return NextResponse.json({ error: "Not your build." }, { status: 404 });

  let processed: Buffer;
  try {
    processed = await sharp(Buffer.from(await file.arrayBuffer()))
      .rotate()
      .resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 80 })
      .toBuffer();
  } catch {
    return NextResponse.json(
      { error: "We couldn't read that image. A JPEG or PNG works best." },
      { status: 415 }
    );
  }

  const photoId = randomUUID();
  const key = photoKey(houseId, photoId, "jpg");
  await putObject(key, processed, "image/jpeg");

  // Written with the service-role client, because an owner holds no insert
  // grant on photos — by design. The scope check above is what authorises it.
  const { createClient } = await import("@supabase/supabase-js");
  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
  const { error } = await admin.from("photos").insert({
    id: photoId,
    house_id: houseId,
    key,
    status: "ready",
    origin: "owner",
    bytes: processed.length,
  });
  if (error) return NextResponse.json({ error: "Couldn't save that photo." }, { status: 500 });

  return NextResponse.json({ photoId }, { status: 201 });
}

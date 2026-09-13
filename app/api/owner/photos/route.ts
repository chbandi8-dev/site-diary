import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";
import { randomUUID } from "crypto";
import { currentHouse, currentViewer } from "@/lib/owner/session";
import { createOwnerPhoto } from "@/lib/db/owner";
import { photoKey, putObject } from "@/lib/r2";
import { overLimit, wrongOrigin } from "@/lib/owner/guard";

export const dynamic = "force-dynamic";

/**
 * A photo attached to something an owner is reporting.
 *
 * Processed on the server rather than in the browser. Owner uploads are rare —
 * a handful a week against his hundreds — so the cost is irrelevant, and doing
 * it here means the EXIF block, and the home's GPS coordinates inside it, are
 * verifiably gone rather than gone if their browser cooperated. `.rotate()`
 * applies the orientation tag before it is dropped, which is what stops
 * portrait photos arriving sideways.
 */

const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

export async function POST(req: NextRequest) {
  if (wrongOrigin(req)) {
    return NextResponse.json({ error: "Request blocked." }, { status: 403 });
  }

  const access = await currentHouse();
  if (!access) {
    return NextResponse.json({ error: "That link has expired." }, { status: 401 });
  }

  const limited = await overLimit(access.houseId, "photos");
  if (limited) return limited;
  if (!(await currentViewer(access.houseId))) {
    return NextResponse.json({ error: "Add your name and email first." }, { status: 403 });
  }

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No photo was attached." }, { status: 400 });
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json({ error: "That photo is too large." }, { status: 413 });
  }

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
  const key = photoKey(access.houseId, photoId, "jpg");
  await putObject(key, processed, "image/jpeg");

  await createOwnerPhoto(access.houseId, { id: photoId, key, bytes: processed.length });

  return NextResponse.json({ photoId }, { status: 201 });
}

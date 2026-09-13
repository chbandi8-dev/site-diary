import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { photoKey, signUpload, objectExists } from "@/lib/r2";
import { z } from "zod";

/**
 * Photo upload: row first, bytes second, confirm third.
 *
 *   POST /api/pm/photos     reserve  -> row at status='pending', presigned PUT
 *   PUT  <uploadUrl>        bytes    -> straight to R2, never through us
 *   PATCH /api/pm/photos    confirm  -> HEAD the object, flip to status='ready'
 *
 * Row-first is the recoverable order. If the bytes were written first and the
 * insert then failed, we would hold an object with no record of which house it
 * belongs to — unfindable and unattributable. This way Postgres is always
 * authoritative and R2 is sweepable: a `pending` row older than a day is either
 * promoted (object present: the confirm was simply lost) or deleted (absent).
 * Galleries read `ready` only, so a broken tile is impossible by construction.
 *
 * The id comes from the client so a retried capture is idempotent. Without it,
 * an upload that times out on site and is retried yields two photos — and two
 * notifications to the same owner about the same slab pour.
 */

const ALLOWED = new Map([
  ["image/jpeg", "jpg"],
  ["image/webp", "webp"],
]);

const MAX_BYTES = 6_000_000;

const reserve = z.object({
  photoId: z.string().uuid(),
  houseId: z.string().uuid(),
  contentType: z.string(),
  bytes: z.number().int().positive().max(MAX_BYTES),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
  takenAt: z.string().datetime().optional(),
  capturedLat: z.number().min(-90).max(90).optional(),
  capturedLng: z.number().min(-180).max(180).optional(),
  origin: z.enum(["in_app", "camera_roll", "inbound"]).default("in_app"),
});

const confirm = z.object({ photoId: z.string().uuid() });

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = reserve.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const { photoId, houseId, contentType, bytes, takenAt, ...rest } = parsed.data;

  const ext = ALLOWED.get(contentType);
  if (!ext) {
    return NextResponse.json(
      { error: "Photos must be JPEG or WebP. They are converted before upload." },
      { status: 415 }
    );
  }

  const house = await prisma.house.findUnique({ where: { id: houseId }, select: { id: true } });
  if (!house) return NextResponse.json({ error: "House not found" }, { status: 404 });

  // The key is derived server-side from ids we control. A presigned PUT is a
  // bearer write capability: if any part of the key came from the request body,
  // a buggy or hostile client could write into another house's prefix, or
  // overwrite an existing photo.
  const key = photoKey(houseId, photoId, ext);

  const existing = await prisma.photo.findUnique({
    where: { id: photoId },
    select: { id: true, key: true, status: true },
  });
  if (existing && existing.key !== key) {
    return NextResponse.json({ error: "Photo id already used" }, { status: 409 });
  }

  await prisma.photo.upsert({
    where: { id: photoId },
    update: {},
    create: {
      id: photoId,
      houseId,
      key,
      bytes,
      takenAt: takenAt ? new Date(takenAt) : undefined,
      ...rest,
    },
  });

  // Signing an exact ContentLength bounds the upload. Client-side compression
  // is an unverifiable promise; without a bound, one broken client pushes a
  // 40 MB original into a 10 GB tier.
  return NextResponse.json({
    photoId,
    key,
    uploadUrl: await signUpload(key, contentType, bytes),
  });
}

export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = confirm.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  const photo = await prisma.photo.findUnique({
    where: { id: parsed.data.photoId },
    select: { id: true, key: true, status: true },
  });
  if (!photo) return NextResponse.json({ error: "Photo not found" }, { status: 404 });
  if (photo.status === "ready") return NextResponse.json({ id: photo.id, status: "ready" });

  // Trust the bucket, not the caller. A client that reports success after a
  // failed PUT would otherwise leave a ready row pointing at nothing.
  if (!(await objectExists(photo.key))) {
    return NextResponse.json(
      { error: "The photo hasn't arrived in storage yet. It stays queued." },
      { status: 409 }
    );
  }

  const ready = await prisma.photo.update({
    where: { id: photo.id },
    data: { status: "ready" },
    select: { id: true, status: true },
  });
  return NextResponse.json(ready);
}

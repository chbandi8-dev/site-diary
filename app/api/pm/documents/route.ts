import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { documentKey, signUpload, objectExists, deleteObject } from "@/lib/r2";
import { z } from "zod";

export const dynamic = "force-dynamic";

/**
 * The owner's document shelf: plans, permits, the contract, certificates,
 * warranties.
 *
 * Same reserve / upload / confirm order as photos, and for the same reason —
 * the row is written first so a failed upload leaves something sweepable rather
 * than an object in a bucket with no record of whose house it belongs to.
 *
 * There is no "internal" option here by design. A per-file visibility flag is
 * one mistap away from publishing a subcontractor's quote to the client, and
 * the mistap is likeliest at 5pm on site. Everything filed here is the owner's;
 * internal paperwork stays out of the app.
 */

const ALLOWED = new Map([
  ["application/pdf", true],
  ["image/jpeg", true],
  ["image/png", true],
  ["image/webp", true],
]);

const MAX_BYTES = 25_000_000;

const CATEGORIES = [
  "plans",
  "permits",
  "contract",
  "certificates",
  "warranties",
  "other",
] as const;

const reserve = z.object({
  documentId: z.string().uuid(),
  houseId: z.string().uuid(),
  title: z.string().trim().min(1).max(160),
  category: z.enum(CATEGORIES).default("other"),
  filename: z.string().trim().min(1).max(200),
  contentType: z.string(),
  bytes: z.number().int().positive().max(MAX_BYTES),
});

const confirm = z.object({ documentId: z.string().uuid() });

async function staff(): Promise<boolean> {
  return Boolean(await getServerSession(authOptions));
}

export async function POST(req: NextRequest) {
  if (!(await staff())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = reserve.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const { documentId, houseId, title, category, filename, contentType, bytes } = parsed.data;

  if (!ALLOWED.has(contentType)) {
    return NextResponse.json(
      { error: "Documents can be PDF, JPEG, PNG or WebP." },
      { status: 415 }
    );
  }

  const house = await prisma.house.findUnique({ where: { id: houseId }, select: { id: true } });
  if (!house) return NextResponse.json({ error: "House not found" }, { status: 404 });

  // Derived server-side from ids we control. A presigned PUT is a bearer write
  // capability, so a key built from anything in the request body would let a
  // broken client write into another house's prefix.
  const key = documentKey(houseId, documentId, filename);

  const existing = await prisma.document.findUnique({
    where: { id: documentId },
    select: { key: true },
  });
  if (existing && existing.key !== key) {
    return NextResponse.json({ error: "Document id already used" }, { status: 409 });
  }

  await prisma.document.upsert({
    where: { id: documentId },
    update: { title, category },
    create: { id: documentId, houseId, title, category, key, bytes, mimeType: contentType },
  });

  return NextResponse.json({
    documentId,
    uploadUrl: await signUpload(key, contentType, bytes),
  });
}

export async function PATCH(req: NextRequest) {
  if (!(await staff())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = confirm.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  const doc = await prisma.document.findUnique({
    where: { id: parsed.data.documentId },
    select: { id: true, key: true, houseId: true, status: true },
  });
  if (!doc) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (doc.status === "ready") return NextResponse.json({ id: doc.id, status: "ready" });
  if (!doc.key.startsWith(`houses/${doc.houseId}/`)) {
    return NextResponse.json({ error: "That document isn't filed to a house." }, { status: 409 });
  }

  // Trust the bucket, not the caller. A client reporting success after a failed
  // PUT would otherwise put a broken row on the owner's page.
  if (!(await objectExists(doc.key))) {
    return NextResponse.json(
      { error: "The file hasn't arrived in storage yet." },
      { status: 409 }
    );
  }

  const ready = await prisma.document.update({
    where: { id: doc.id },
    data: { status: "ready" },
    select: { id: true, status: true },
  });
  return NextResponse.json(ready);
}

/**
 * Removed properly — row and object together.
 *
 * Unlike a variation there is nothing evidentiary about keeping a superseded
 * plan set on the owner's page; a stale drawing that someone builds from is
 * worse than no drawing. The object goes first: a deleted row pointing at a
 * live object is a leak, while a live row pointing at a deleted object is a
 * broken link the next confirm would catch.
 */
export async function DELETE(req: NextRequest) {
  if (!(await staff())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  const doc = await prisma.document.findUnique({ where: { id }, select: { id: true, key: true } });
  if (!doc) return NextResponse.json({ ok: true });

  try {
    await deleteObject(doc.key);
  } catch {
    // Leaving the row behind would keep it on the owner's page, which is the
    // worse outcome. The object is swept by prefix later.
  }
  await prisma.document.delete({ where: { id: doc.id } });

  return NextResponse.json({ ok: true });
}

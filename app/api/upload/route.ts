export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { signUpload, documentKey } from "@/lib/r2";
import { randomUUID } from "crypto";

/**
 * CMS image upload for the marketing site.
 *
 * Previously wrote to `public/uploads` on local disk. On Vercel that filesystem
 * is read-only and ephemeral: every image vanished on the next deploy and was
 * never shared between function instances. Now a presigned direct-to-R2 PUT,
 * same as site photos.
 *
 * Existing `/uploads/...` paths in the database still resolve for anything
 * committed to the repo. New uploads return an R2 URL.
 */

const ALLOWED = new Map([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
]);

const MAX_BYTES = 10 * 1024 * 1024;

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { contentType, bytes, filename } = (await req.json()) as {
    contentType?: string;
    bytes?: number;
    filename?: string;
  };

  const ext = contentType ? ALLOWED.get(contentType) : undefined;
  if (!ext) {
    return NextResponse.json({ error: "Images must be JPEG, PNG or WebP." }, { status: 415 });
  }
  if (!bytes || bytes <= 0 || bytes > MAX_BYTES) {
    return NextResponse.json({ error: "Images must be under 10MB." }, { status: 413 });
  }

  const key = documentKey("cms", randomUUID(), filename ?? `image.${ext}`);
  const uploadUrl = await signUpload(key, contentType!, bytes);

  return NextResponse.json({
    uploadUrl,
    url: `${process.env.R2_PUBLIC_BASE_URL}/${key}`,
  });
}

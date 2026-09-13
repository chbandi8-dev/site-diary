"use client";

import imageCompression from "browser-image-compression";
import exifr from "exifr";

/**
 * Client-side photo pipeline for site capture.
 *
 * Order matters here, and it is not the obvious one: READ EXIF FIRST, then
 * compress. Compression re-encodes through a canvas, which discards the entire
 * EXIF block — so GPS and the original capture time are gone by the time the
 * compressed file exists. Both are needed:
 *
 *   - GPS auto-assigns the house. Detached houses sit hundreds of metres apart,
 *     so coordinates identify the site far more reliably than he can tap it
 *     while holding a tape measure. This is what lets him keep using the native
 *     camera out of habit and have the app file the photos afterwards.
 *   - The original timestamp is when the shutter fired, which is what the
 *     owner's timeline should show — not when a queued upload finally drained.
 *
 * Losing EXIF on the uploaded file is the desired outcome, not a side effect.
 * A site photo carries the exact coordinates of somebody's home, and these get
 * forwarded into family group chats. Do not turn on `preserveExif`: it would
 * fix orientation by re-attaching the GPS tag too.
 *
 * Compression is load-bearing for cost as well. A raw 12MP photo is 3-5 MB; at
 * 25 houses x 5 photos a day that is ~19 GB a month against a 10 GB free tier.
 * At 1600px it is ~200 KB, or ~750 MB a month.
 *
 * VERIFY ON A REAL IPHONE BEFORE THE PILOT: that portrait photos are not
 * rotated (canvas re-encode drops the orientation tag, and the library is
 * supposed to apply it first), and whether his camera is set to "High
 * Efficiency" — HEIC is decoded natively by Safari but not by Chrome or
 * Android, so it fails by platform, not by file.
 */

const MAX_DIMENSION = 1600;
const TARGET_MB = 0.35;

export type PhotoMetadata = {
  takenAt?: Date;
  lat?: number;
  lng?: number;
};

/** Pull GPS and capture time out of the original file, before anything destroys them. */
export async function readPhotoMetadata(file: File): Promise<PhotoMetadata> {
  try {
    const exif = await exifr.parse(file, {
      pick: ["DateTimeOriginal", "CreateDate", "latitude", "longitude"],
      gps: true,
    });
    if (!exif) return {};
    return {
      takenAt: exif.DateTimeOriginal ?? exif.CreateDate ?? undefined,
      lat: typeof exif.latitude === "number" ? exif.latitude : undefined,
      lng: typeof exif.longitude === "number" ? exif.longitude : undefined,
    };
  } catch {
    // Plenty of photos have no EXIF — a screenshot, a forwarded image, a
    // camera with location services off. Not an error.
    return {};
  }
}

export type PreparedPhoto = {
  file: File;
  contentType: "image/jpeg";
  width: number;
  height: number;
  bytes: number;
  metadata: PhotoMetadata;
};

export async function preparePhoto(input: File): Promise<PreparedPhoto> {
  const metadata = await readPhotoMetadata(input);

  const isHeic = /image\/hei[cf]/i.test(input.type) || /\.hei[cf]$/i.test(input.name);

  let compressed: File;
  try {
    compressed = await imageCompression(input, {
      maxWidthOrHeight: MAX_DIMENSION,
      maxSizeMB: TARGET_MB,
      useWebWorker: true,
      fileType: "image/jpeg",
      initialQuality: 0.8,
      preserveExif: false,
    });
  } catch {
    if (isHeic) {
      throw new Error(
        "That photo is in Apple's HEIC format, which this browser can't read. " +
          "In Settings › Camera › Formats, choose Most Compatible — or take the photo in the app."
      );
    }
    throw new Error("That image couldn't be processed. Try taking it again.");
  }

  const { width, height } = await readDimensions(compressed);

  return {
    file: compressed,
    contentType: "image/jpeg",
    width,
    height,
    bytes: compressed.size,
    metadata: {
      ...metadata,
      takenAt: metadata.takenAt ?? new Date(input.lastModified || Date.now()),
    },
  };
}

function readDimensions(file: File): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not read image dimensions"));
    };
    img.src = url;
  });
}

/**
 * Reserve a row, upload the bytes, confirm. Safe to call again with the same
 * `photoId` after a failure — every step is idempotent, which is what makes the
 * retry button on a site with one bar harmless.
 */
export async function uploadPhoto(
  houseId: string,
  input: File,
  opts: { photoId?: string; origin?: "in_app" | "camera_roll" } = {}
): Promise<{ id: string }> {
  const photoId = opts.photoId ?? crypto.randomUUID();
  const prepared = await preparePhoto(input);

  const reserved = await postJson("/api/pm/photos", "POST", {
    photoId,
    houseId,
    contentType: prepared.contentType,
    bytes: prepared.bytes,
    width: prepared.width,
    height: prepared.height,
    takenAt: prepared.metadata.takenAt?.toISOString(),
    capturedLat: prepared.metadata.lat,
    capturedLng: prepared.metadata.lng,
    origin: opts.origin ?? "in_app",
  });

  const put = await fetch(reserved.uploadUrl as string, {
    method: "PUT",
    headers: { "Content-Type": prepared.contentType },
    body: prepared.file,
  });
  if (!put.ok) {
    throw new Error("The photo didn't reach storage. It stays queued — try again.");
  }

  await postJson("/api/pm/photos", "PATCH", { photoId });
  return { id: photoId };
}

async function postJson(
  url: string,
  method: "POST" | "PATCH",
  body: unknown
): Promise<Record<string, unknown>> {
  const res = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    let message = "Something went wrong saving that photo.";
    try {
      const parsed = (await res.json()) as { error?: string };
      if (parsed.error) message = parsed.error;
    } catch {
      /* keep the fallback */
    }
    throw new Error(message);
  }
  return res.json();
}

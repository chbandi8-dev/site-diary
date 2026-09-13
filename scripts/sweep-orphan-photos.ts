/**
 * Reconciles photo rows against R2, in both directions.
 *
 * Uploads are recorded row-first, so the recoverable failure is a row stuck at
 * `pending`: either the bytes did arrive and only the confirm was lost, or the
 * upload never completed. HEAD the object to tell them apart — promote it, or
 * drop the row. Never delete before checking, or a slow upload loses its photo.
 *
 * Then the other direction: bytes that no longer have a live row. Nothing else
 * in the application deletes an R2 object, so without this a soft-deleted photo
 * keeps paying for storage forever, which matters on a 10 GB free tier.
 *
 *   npm run sweep:photos
 */

import { PrismaClient } from "@prisma/client";
import { objectExists, deleteObject } from "../lib/r2";

const STALE_AFTER_HOURS = 24;
const KEEP_DELETED_DAYS = 30;

async function main() {
  const prisma = new PrismaClient();
  const now = Date.now();

  // 1. Pending rows: recover or drop.
  const pending = await prisma.photo.findMany({
    where: { status: "pending", createdAt: { lt: new Date(now - STALE_AFTER_HOURS * 3_600_000) } },
    select: { id: true, key: true },
  });

  let promoted = 0;
  let dropped = 0;

  for (const photo of pending) {
    if (await objectExists(photo.key)) {
      await prisma.photo.update({ where: { id: photo.id }, data: { status: "ready" } });
      promoted++;
    } else {
      await prisma.photo.delete({ where: { id: photo.id } });
      dropped++;
    }
  }

  // 2. Owner photos that were uploaded but whose report never landed. The
  //    upload succeeds before the report is filed, so a failed submit leaves a
  //    ready row attached to nothing.
  const abandoned = await prisma.photo.findMany({
    where: {
      origin: "owner",
      updateId: null,
      reports: { none: {} },
      createdAt: { lt: new Date(now - STALE_AFTER_HOURS * 3_600_000) },
    },
    select: { id: true, key: true },
  });

  for (const photo of abandoned) {
    await deleteObject(photo.key).catch(() => undefined);
    await prisma.photo.delete({ where: { id: photo.id } });
  }

  // 3. Soft-deleted photos past the grace period: remove the bytes for real.
  const purgeable = await prisma.photo.findMany({
    where: { deletedAt: { lt: new Date(now - KEEP_DELETED_DAYS * 86_400_000) } },
    select: { id: true, key: true },
  });

  for (const photo of purgeable) {
    await deleteObject(photo.key).catch(() => undefined);
    await prisma.photo.delete({ where: { id: photo.id } });
  }

  console.log(
    `Swept ${pending.length} pending (${promoted} recovered, ${dropped} never arrived), ` +
      `${abandoned.length} abandoned owner upload(s), ${purgeable.length} purged.`
  );
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

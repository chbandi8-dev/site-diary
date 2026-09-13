/**
 * Reconciles photo rows against R2.
 *
 * Uploads are recorded row-first, so the recoverable failure is a row stuck at
 * `pending`: either the bytes did arrive and only the confirm was lost, or the
 * upload never completed. HEAD the object to tell them apart — promote it, or
 * drop the row. Never delete before checking, or a slow upload loses its photo.
 *
 *   npx ts-node scripts/sweep-orphan-photos.ts
 */

import { PrismaClient } from "@prisma/client";
import { objectExists } from "../lib/r2";

const STALE_AFTER_HOURS = 24;

async function main() {
  const prisma = new PrismaClient();
  const cutoff = new Date(Date.now() - STALE_AFTER_HOURS * 3_600_000);

  const pending = await prisma.photo.findMany({
    where: { status: "pending", createdAt: { lt: cutoff } },
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

  console.log(
    `Swept ${pending.length} pending photo(s): ${promoted} recovered, ${dropped} never arrived.`
  );
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

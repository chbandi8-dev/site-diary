-- Variations, documents and the wet-day log.
--
-- Additive only: every column is nullable or carries a default, so this applies
-- to a database that is already carrying live builds without rewriting a row.

-- CreateEnum
CREATE TYPE "DocumentStatus" AS ENUM ('pending', 'ready');

-- AlterTable: a variation can now be declined, and either decision is
-- confirmed with a one-time code emailed to the owner's own address.
ALTER TABLE "variations"
  ADD COLUMN "declined_at" TIMESTAMPTZ(3),
  ADD COLUMN "decline_reason" TEXT,
  ADD COLUMN "code_hash" TEXT,
  ADD COLUMN "code_sent_to" TEXT,
  ADD COLUMN "code_expires_at" TIMESTAMPTZ(3),
  ADD COLUMN "code_attempts" INTEGER NOT NULL DEFAULT 0;

-- AlterTable: documents follow the photo lifecycle — row first, bytes second.
-- Existing rows predate the presigned flow and their objects are already in the
-- bucket, so they are promoted rather than left invisible.
ALTER TABLE "documents"
  ADD COLUMN "status" "DocumentStatus" NOT NULL DEFAULT 'pending';

UPDATE "documents" SET "status" = 'ready';

-- CreateIndex
CREATE INDEX "documents_status_idx" ON "documents"("status");

-- AlterTable: what the weather actually stopped.
ALTER TABLE "weather_days"
  ADD COLUMN "note" TEXT;

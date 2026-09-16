-- When each owner last opened their build page.
--
-- Nullable with no default: an owner who has never opened it reads as null,
-- which is a different and more useful fact than "opened at the moment this
-- column was added".
ALTER TABLE "house_owners" ADD COLUMN "last_seen_at" TIMESTAMPTZ(3);

-- A read-only board of every build, shared by link.
--
-- Different from access_links in the one way that matters: an access link is a
-- key to one house and everything in it; this is a key to a thin slice of all
-- of them — address, lot, phase, when it was last touched. Nothing else.

CREATE TABLE "board_links" (
    "id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "hint" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "development_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_used_at" TIMESTAMPTZ(3),
    "use_count" INTEGER NOT NULL DEFAULT 0,
    "revoked_at" TIMESTAMPTZ(3),

    CONSTRAINT "board_links_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "board_links_token_hash_key" ON "board_links"("token_hash");
CREATE INDEX "board_links_revoked_at_idx" ON "board_links"("revoked_at");

ALTER TABLE "board_links" ADD CONSTRAINT "board_links_development_id_fkey"
  FOREIGN KEY ("development_id") REFERENCES "developments"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- Same lockdown as every other table: the app reaches this through the service
-- connection only. A table holding the hash of a key to the whole portfolio is
-- the last one that should be readable by an anonymous Supabase client.
ALTER TABLE "board_links" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "board_links" FROM anon, authenticated;

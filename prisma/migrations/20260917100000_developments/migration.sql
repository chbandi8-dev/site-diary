-- Estate work: a development groups houses under one client, and lots are
-- ordered by lot number rather than by address.
--
-- Named `developments` rather than `projects` because `projects` is already the
-- marketing site's portfolio table. Two different things called the same word in
-- one database is how someone later joins the wrong one.
CREATE TABLE "developments" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "client" TEXT,
    "client_email" TEXT,
    "client_phone" TEXT,
    "release" TEXT,
    "notes" TEXT,
    "archived_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "developments_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "developments" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "developments" FROM anon, authenticated;

-- Both nullable: an individual owner-build belongs to no development and has no
-- lot number, which is the majority of the work and must stay unaffected.
ALTER TABLE "houses"
  ADD COLUMN "lot_number" TEXT,
  ADD COLUMN "development_id" UUID;

CREATE INDEX "houses_development_id_lot_number_idx"
  ON "houses"("development_id", "lot_number");

-- SET NULL rather than CASCADE: deleting a development must never take its
-- houses, and every build's history, with it.
ALTER TABLE "houses" ADD CONSTRAINT "houses_development_id_fkey"
  FOREIGN KEY ("development_id") REFERENCES "developments"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- When a stage should finish to hit the contracted date, worked backwards from
-- it. Distinct from estimated_end, which is when it will finish at the current
-- rate; the gap between them is the slip.
ALTER TABLE "house_stages" ADD COLUMN "due_by" DATE;

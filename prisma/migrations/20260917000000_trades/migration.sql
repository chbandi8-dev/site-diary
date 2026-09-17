-- The trades he rings. Staff-side only: nothing in this table is ever rendered
-- on an owner's page, which is why it carries a free-text note field.
CREATE TABLE "trades" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "company" TEXT,
    "trade" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "notes" TEXT,
    "archived_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "trades_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "trades_trade_idx" ON "trades"("trade");

-- Same lockdown as every other table: owners never reach PostgREST, so row
-- security is on with no policies and no grants to the public roles.
ALTER TABLE "trades" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "trades" FROM anon, authenticated;

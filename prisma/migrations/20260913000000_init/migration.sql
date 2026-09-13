-- CreateEnum
CREATE TYPE "HouseStatus" AS ENUM ('pre_start', 'active', 'on_hold', 'practical_completion', 'handed_over');

-- CreateEnum
CREATE TYPE "StageStatus" AS ENUM ('not_started', 'scheduled', 'in_progress', 'on_hold', 'complete', 'not_applicable');

-- CreateEnum
CREATE TYPE "UpdateKind" AS ENUM ('progress', 'delay', 'milestone', 'weather', 'decision', 'message');

-- CreateEnum
CREATE TYPE "DecisionStatus" AS ENUM ('open', 'answered', 'withdrawn');

-- CreateEnum
CREATE TYPE "VariationStatus" AS ENUM ('draft', 'sent', 'approved', 'declined');

-- CreateEnum
CREATE TYPE "NotifyChannel" AS ENUM ('email', 'sms', 'push');

-- CreateEnum
CREATE TYPE "NotifyAudience" AS ENUM ('owner', 'staff');

-- CreateEnum
CREATE TYPE "NotifyStatus" AS ENUM ('queued', 'sent', 'failed');

-- CreateEnum
CREATE TYPE "InspectionKind" AS ENUM ('pre_pour_footings', 'frame', 'waterproofing', 'stormwater', 'vehicle_crossing', 'final_occupation', 'other');

-- CreateEnum
CREATE TYPE "InspectionStatus" AS ENUM ('not_required', 'to_book', 'booked', 'passed', 'failed');

-- CreateEnum
CREATE TYPE "ClaimStatus" AS ENUM ('not_due', 'due', 'invoiced', 'paid');

-- CreateEnum
CREATE TYPE "DefectStatus" AS ENUM ('open', 'in_progress', 'resolved', 'disputed');

-- CreateEnum
CREATE TYPE "PhotoOrigin" AS ENUM ('in_app', 'camera_roll', 'inbound', 'owner');

-- CreateEnum
CREATE TYPE "OwnerReportKind" AS ENUM ('question', 'issue', 'maintenance');

-- CreateEnum
CREATE TYPE "OwnerReportStatus" AS ENUM ('submitted', 'acknowledged', 'in_progress', 'resolved', 'no_action_needed');

-- CreateEnum
CREATE TYPE "PhotoStatus" AS ENUM ('pending', 'ready');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "name" TEXT,
    "role" TEXT NOT NULL DEFAULT 'admin',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "projects" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "short_description" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'completed',
    "location" TEXT,
    "year" TEXT,
    "client" TEXT,
    "cover_image" TEXT,
    "images" TEXT NOT NULL DEFAULT '[]',
    "featured" BOOLEAN NOT NULL DEFAULT false,
    "published" BOOLEAN NOT NULL DEFAULT true,
    "order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "services" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "icon" TEXT,
    "image" TEXT,
    "features" TEXT NOT NULL DEFAULT '[]',
    "published" BOOLEAN NOT NULL DEFAULT true,
    "order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "services_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "testimonials" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "company" TEXT,
    "role" TEXT,
    "text" TEXT NOT NULL,
    "rating" INTEGER NOT NULL DEFAULT 5,
    "avatar" TEXT,
    "published" BOOLEAN NOT NULL DEFAULT true,
    "order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "testimonials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "site_content" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'text',
    "label" TEXT,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "site_content_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "messages" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "service" TEXT,
    "message" TEXT NOT NULL,
    "read" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "houses" (
    "id" UUID NOT NULL,
    "address" TEXT NOT NULL,
    "suburb" TEXT,
    "storeys" INTEGER NOT NULL DEFAULT 1,
    "status" "HouseStatus" NOT NULL DEFAULT 'pre_start',
    "contract_cents" INTEGER,
    "start_date" DATE,
    "target_handover" DATE,
    "cover_photo_id" UUID,
    "waiting_on" TEXT,
    "waiting_on_eta" DATE,
    "handover_from" DATE,
    "handover_to" DATE,
    "handed_over_at" DATE,
    "defects_liability_ends_at" DATE,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "houses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "owners" (
    "id" UUID NOT NULL,
    "auth_user_id" UUID,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "notify_by_email" BOOLEAN NOT NULL DEFAULT true,
    "notify_by_sms" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "registered_at" TIMESTAMPTZ(3),

    CONSTRAINT "owners_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "access_links" (
    "id" UUID NOT NULL,
    "house_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "hint" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_used_at" TIMESTAMPTZ(3),
    "use_count" INTEGER NOT NULL DEFAULT 0,
    "revoked_at" TIMESTAMPTZ(3),

    CONSTRAINT "access_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "house_owners" (
    "house_id" UUID NOT NULL,
    "owner_id" UUID NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'owner',
    "invited_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked_at" TIMESTAMPTZ(3),

    CONSTRAINT "house_owners_pkey" PRIMARY KEY ("house_id","owner_id")
);

-- CreateTable
CREATE TABLE "stage_templates" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "position" DOUBLE PRECISION NOT NULL,
    "phase" TEXT NOT NULL,
    "is_payment_milestone" BOOLEAN NOT NULL DEFAULT false,
    "conditional" BOOLEAN NOT NULL DEFAULT false,
    "typical_days" INTEGER,

    CONSTRAINT "stage_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "house_stages" (
    "id" UUID NOT NULL,
    "house_id" UUID NOT NULL,
    "template_id" UUID,
    "name" TEXT NOT NULL,
    "phase" TEXT,
    "position" DOUBLE PRECISION NOT NULL,
    "is_payment_milestone" BOOLEAN NOT NULL DEFAULT false,
    "planned_days" INTEGER,
    "status" "StageStatus" NOT NULL DEFAULT 'not_started',
    "estimated_end" DATE,
    "started_at" TIMESTAMPTZ(3),
    "completed_at" TIMESTAMPTZ(3),

    CONSTRAINT "house_stages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stage_estimates" (
    "id" UUID NOT NULL,
    "house_stage_id" UUID NOT NULL,
    "estimated_end" DATE NOT NULL,
    "reason" TEXT,
    "computed_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notified_at" TIMESTAMPTZ(3),

    CONSTRAINT "stage_estimates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "updates" (
    "id" UUID NOT NULL,
    "house_id" UUID NOT NULL,
    "stage_id" UUID,
    "kind" "UpdateKind" NOT NULL DEFAULT 'progress',
    "body" TEXT NOT NULL,
    "author_id" TEXT NOT NULL,
    "occurred_at" TIMESTAMPTZ(3) NOT NULL,
    "published_at" TIMESTAMPTZ(3),
    "published_by_id" TEXT,
    "hold_until" TIMESTAMPTZ(3),
    "delay_reason" TEXT,
    "deleted_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "template_key" TEXT,

    CONSTRAINT "updates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "internal_notes" (
    "id" UUID NOT NULL,
    "house_id" UUID NOT NULL,
    "body" TEXT NOT NULL,
    "author_id" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "internal_notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "photos" (
    "id" UUID NOT NULL,
    "house_id" UUID,
    "update_id" UUID,
    "stage_id" UUID,
    "origin" "PhotoOrigin" NOT NULL DEFAULT 'in_app',
    "status" "PhotoStatus" NOT NULL DEFAULT 'pending',
    "key" TEXT NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "bytes" INTEGER,
    "caption" TEXT,
    "captured_lat" DOUBLE PRECISION,
    "captured_lng" DOUBLE PRECISION,
    "marketing_ok" BOOLEAN NOT NULL DEFAULT false,
    "taken_at" TIMESTAMPTZ(3),
    "deleted_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "photos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "decisions" (
    "id" UUID NOT NULL,
    "house_id" UUID NOT NULL,
    "question" TEXT NOT NULL,
    "detail" TEXT,
    "options" JSONB,
    "due_date" DATE,
    "consequence" TEXT,
    "status" "DecisionStatus" NOT NULL DEFAULT 'open',
    "asked_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "answered_at" TIMESTAMPTZ(3),
    "answer" TEXT,

    CONSTRAINT "decisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "variations" (
    "id" UUID NOT NULL,
    "house_id" UUID NOT NULL,
    "reference" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "amount_cents" INTEGER NOT NULL,
    "status" "VariationStatus" NOT NULL DEFAULT 'draft',
    "sent_at" TIMESTAMPTZ(3),
    "approved_at" TIMESTAMPTZ(3),
    "approved_by_id" UUID,
    "approved_ip" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "variations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "documents" (
    "id" UUID NOT NULL,
    "house_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'other',
    "key" TEXT NOT NULL,
    "bytes" INTEGER,
    "mime_type" TEXT,
    "uploaded_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "owner_reports" (
    "id" UUID NOT NULL,
    "house_id" UUID NOT NULL,
    "owner_id" UUID NOT NULL,
    "kind" "OwnerReportKind" NOT NULL DEFAULT 'question',
    "status" "OwnerReportStatus" NOT NULL DEFAULT 'submitted',
    "body" TEXT NOT NULL,
    "photo_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acknowledged_at" TIMESTAMPTZ(3),
    "reply_body" TEXT,
    "replied_at" TIMESTAMPTZ(3),
    "replied_by_id" TEXT,
    "resolved_at" TIMESTAMPTZ(3),
    "defect_id" UUID,

    CONSTRAINT "owner_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_logs" (
    "id" UUID NOT NULL,
    "audience" "NotifyAudience" NOT NULL DEFAULT 'owner',
    "house_id" UUID,
    "owner_id" UUID,
    "user_id" TEXT,
    "update_id" UUID,
    "report_id" UUID,
    "channel" "NotifyChannel" NOT NULL,
    "status" "NotifyStatus" NOT NULL DEFAULT 'queued',
    "dedupe_key" TEXT NOT NULL,
    "subject" TEXT,
    "body" TEXT,
    "error" TEXT,
    "provider_id" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sent_at" TIMESTAMPTZ(3),

    CONSTRAINT "notification_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "message_templates" (
    "id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "kind" "UpdateKind" NOT NULL DEFAULT 'progress',
    "category" TEXT NOT NULL,
    "category_position" INTEGER NOT NULL DEFAULT 99,
    "slots" JSONB,
    "stage_slugs" TEXT[],
    "auto_publish" BOOLEAN NOT NULL DEFAULT true,
    "wants_photo" BOOLEAN NOT NULL DEFAULT false,
    "position" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "message_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inspections" (
    "id" UUID NOT NULL,
    "house_id" UUID NOT NULL,
    "house_stage_id" UUID,
    "kind" "InspectionKind" NOT NULL,
    "status" "InspectionStatus" NOT NULL DEFAULT 'to_book',
    "inspector" TEXT,
    "booked_for" TIMESTAMPTZ(3),
    "result_at" TIMESTAMPTZ(3),
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "inspections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "claim_milestones" (
    "id" UUID NOT NULL,
    "house_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "definition" TEXT,
    "amount_cents" INTEGER NOT NULL,
    "status" "ClaimStatus" NOT NULL DEFAULT 'not_due',
    "due_at" DATE,
    "invoiced_at" TIMESTAMPTZ(3),
    "paid_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "claim_milestones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "handover_forecasts" (
    "id" UUID NOT NULL,
    "house_id" UUID NOT NULL,
    "from" DATE NOT NULL,
    "to" DATE NOT NULL,
    "reason" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notified_at" TIMESTAMPTZ(3),

    CONSTRAINT "handover_forecasts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "defects" (
    "id" UUID NOT NULL,
    "house_id" UUID NOT NULL,
    "reference" TEXT,
    "location" TEXT,
    "description" TEXT NOT NULL,
    "status" "DefectStatus" NOT NULL DEFAULT 'open',
    "raised_by_owner" BOOLEAN NOT NULL DEFAULT false,
    "raised_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "target_at" DATE,
    "resolved_at" TIMESTAMPTZ(3),
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "defects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "weather_days" (
    "id" UUID NOT NULL,
    "house_id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "rainfall_mm" DOUBLE PRECISION,
    "work_lost" BOOLEAN NOT NULL DEFAULT false,
    "source" TEXT NOT NULL DEFAULT 'bom',
    "eot_claimed_at" TIMESTAMPTZ(3),

    CONSTRAINT "weather_days_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "evidence_events" (
    "id" UUID NOT NULL,
    "subject" TEXT NOT NULL,
    "subject_id" UUID NOT NULL,
    "event" TEXT NOT NULL,
    "actor_type" TEXT NOT NULL,
    "actor_id" TEXT,
    "at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ip" TEXT,
    "user_agent" TEXT,
    "payload" JSONB,

    CONSTRAINT "evidence_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "projects_slug_key" ON "projects"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "services_slug_key" ON "services"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "site_content_key_key" ON "site_content"("key");

-- CreateIndex
CREATE INDEX "messages_read_created_at_idx" ON "messages"("read", "created_at");

-- CreateIndex
CREATE INDEX "houses_status_idx" ON "houses"("status");

-- CreateIndex
CREATE UNIQUE INDEX "owners_auth_user_id_key" ON "owners"("auth_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "owners_email_key" ON "owners"("email");

-- CreateIndex
CREATE INDEX "owners_auth_user_id_idx" ON "owners"("auth_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "access_links_token_hash_key" ON "access_links"("token_hash");

-- CreateIndex
CREATE INDEX "access_links_house_id_revoked_at_idx" ON "access_links"("house_id", "revoked_at");

-- CreateIndex
CREATE INDEX "house_owners_owner_id_house_id_idx" ON "house_owners"("owner_id", "house_id");

-- CreateIndex
CREATE UNIQUE INDEX "stage_templates_slug_key" ON "stage_templates"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "stage_templates_position_key" ON "stage_templates"("position");

-- CreateIndex
CREATE INDEX "house_stages_house_id_position_idx" ON "house_stages"("house_id", "position");

-- CreateIndex
CREATE UNIQUE INDEX "house_stages_house_id_template_id_key" ON "house_stages"("house_id", "template_id");

-- CreateIndex
CREATE INDEX "stage_estimates_house_stage_id_computed_at_idx" ON "stage_estimates"("house_stage_id", "computed_at");

-- CreateIndex
CREATE INDEX "updates_house_id_occurred_at_idx" ON "updates"("house_id", "occurred_at" DESC);

-- CreateIndex
CREATE INDEX "updates_house_id_published_at_idx" ON "updates"("house_id", "published_at");

-- CreateIndex
CREATE INDEX "internal_notes_house_id_created_at_idx" ON "internal_notes"("house_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "photos_key_key" ON "photos"("key");

-- CreateIndex
CREATE INDEX "photos_house_id_taken_at_idx" ON "photos"("house_id", "taken_at");

-- CreateIndex
CREATE INDEX "photos_update_id_idx" ON "photos"("update_id");

-- CreateIndex
CREATE INDEX "photos_status_idx" ON "photos"("status");

-- CreateIndex
CREATE INDEX "decisions_house_id_status_idx" ON "decisions"("house_id", "status");

-- CreateIndex
CREATE INDEX "variations_house_id_status_idx" ON "variations"("house_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "variations_house_id_reference_key" ON "variations"("house_id", "reference");

-- CreateIndex
CREATE UNIQUE INDEX "documents_key_key" ON "documents"("key");

-- CreateIndex
CREATE INDEX "documents_house_id_category_idx" ON "documents"("house_id", "category");

-- CreateIndex
CREATE INDEX "owner_reports_house_id_created_at_idx" ON "owner_reports"("house_id", "created_at");

-- CreateIndex
CREATE INDEX "owner_reports_status_created_at_idx" ON "owner_reports"("status", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "notification_logs_dedupe_key_key" ON "notification_logs"("dedupe_key");

-- CreateIndex
CREATE INDEX "notification_logs_owner_id_created_at_idx" ON "notification_logs"("owner_id", "created_at");

-- CreateIndex
CREATE INDEX "notification_logs_user_id_created_at_idx" ON "notification_logs"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "notification_logs_status_idx" ON "notification_logs"("status");

-- CreateIndex
CREATE UNIQUE INDEX "message_templates_key_key" ON "message_templates"("key");

-- CreateIndex
CREATE INDEX "message_templates_category_position_idx" ON "message_templates"("category", "position");

-- CreateIndex
CREATE INDEX "inspections_house_id_status_idx" ON "inspections"("house_id", "status");

-- CreateIndex
CREATE INDEX "claim_milestones_house_id_status_idx" ON "claim_milestones"("house_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "claim_milestones_house_id_position_key" ON "claim_milestones"("house_id", "position");

-- CreateIndex
CREATE INDEX "handover_forecasts_house_id_created_at_idx" ON "handover_forecasts"("house_id", "created_at");

-- CreateIndex
CREATE INDEX "defects_house_id_status_idx" ON "defects"("house_id", "status");

-- CreateIndex
CREATE INDEX "weather_days_house_id_work_lost_idx" ON "weather_days"("house_id", "work_lost");

-- CreateIndex
CREATE UNIQUE INDEX "weather_days_house_id_date_key" ON "weather_days"("house_id", "date");

-- CreateIndex
CREATE INDEX "evidence_events_subject_subject_id_at_idx" ON "evidence_events"("subject", "subject_id", "at");

-- AddForeignKey
ALTER TABLE "access_links" ADD CONSTRAINT "access_links_house_id_fkey" FOREIGN KEY ("house_id") REFERENCES "houses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "house_owners" ADD CONSTRAINT "house_owners_house_id_fkey" FOREIGN KEY ("house_id") REFERENCES "houses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "house_owners" ADD CONSTRAINT "house_owners_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "owners"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "house_stages" ADD CONSTRAINT "house_stages_house_id_fkey" FOREIGN KEY ("house_id") REFERENCES "houses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "house_stages" ADD CONSTRAINT "house_stages_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "stage_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stage_estimates" ADD CONSTRAINT "stage_estimates_house_stage_id_fkey" FOREIGN KEY ("house_stage_id") REFERENCES "house_stages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "updates" ADD CONSTRAINT "updates_house_id_fkey" FOREIGN KEY ("house_id") REFERENCES "houses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "updates" ADD CONSTRAINT "updates_stage_id_fkey" FOREIGN KEY ("stage_id") REFERENCES "house_stages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "updates" ADD CONSTRAINT "updates_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "internal_notes" ADD CONSTRAINT "internal_notes_house_id_fkey" FOREIGN KEY ("house_id") REFERENCES "houses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "internal_notes" ADD CONSTRAINT "internal_notes_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "photos" ADD CONSTRAINT "photos_house_id_fkey" FOREIGN KEY ("house_id") REFERENCES "houses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "photos" ADD CONSTRAINT "photos_update_id_fkey" FOREIGN KEY ("update_id") REFERENCES "updates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "photos" ADD CONSTRAINT "photos_stage_id_fkey" FOREIGN KEY ("stage_id") REFERENCES "house_stages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "decisions" ADD CONSTRAINT "decisions_house_id_fkey" FOREIGN KEY ("house_id") REFERENCES "houses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "variations" ADD CONSTRAINT "variations_house_id_fkey" FOREIGN KEY ("house_id") REFERENCES "houses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "variations" ADD CONSTRAINT "variations_approved_by_id_fkey" FOREIGN KEY ("approved_by_id") REFERENCES "owners"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_house_id_fkey" FOREIGN KEY ("house_id") REFERENCES "houses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "owner_reports" ADD CONSTRAINT "owner_reports_house_id_fkey" FOREIGN KEY ("house_id") REFERENCES "houses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "owner_reports" ADD CONSTRAINT "owner_reports_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "owners"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "owner_reports" ADD CONSTRAINT "owner_reports_photo_id_fkey" FOREIGN KEY ("photo_id") REFERENCES "photos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "owner_reports" ADD CONSTRAINT "owner_reports_defect_id_fkey" FOREIGN KEY ("defect_id") REFERENCES "defects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "owner_reports" ADD CONSTRAINT "owner_reports_replied_by_id_fkey" FOREIGN KEY ("replied_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_logs" ADD CONSTRAINT "notification_logs_house_id_fkey" FOREIGN KEY ("house_id") REFERENCES "houses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_logs" ADD CONSTRAINT "notification_logs_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "owners"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_logs" ADD CONSTRAINT "notification_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_logs" ADD CONSTRAINT "notification_logs_update_id_fkey" FOREIGN KEY ("update_id") REFERENCES "updates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_logs" ADD CONSTRAINT "notification_logs_report_id_fkey" FOREIGN KEY ("report_id") REFERENCES "owner_reports"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inspections" ADD CONSTRAINT "inspections_house_id_fkey" FOREIGN KEY ("house_id") REFERENCES "houses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inspections" ADD CONSTRAINT "inspections_house_stage_id_fkey" FOREIGN KEY ("house_stage_id") REFERENCES "house_stages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "claim_milestones" ADD CONSTRAINT "claim_milestones_house_id_fkey" FOREIGN KEY ("house_id") REFERENCES "houses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "handover_forecasts" ADD CONSTRAINT "handover_forecasts_house_id_fkey" FOREIGN KEY ("house_id") REFERENCES "houses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "defects" ADD CONSTRAINT "defects_house_id_fkey" FOREIGN KEY ("house_id") REFERENCES "houses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "weather_days" ADD CONSTRAINT "weather_days_house_id_fkey" FOREIGN KEY ("house_id") REFERENCES "houses"("id") ON DELETE CASCADE ON UPDATE CASCADE;


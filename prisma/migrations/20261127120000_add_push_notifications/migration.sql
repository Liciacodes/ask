-- CreateTable
-- One row per browser that turned reminders on. owner_id is a visitor id or a user id, like reminders.user_id.
CREATE TABLE "push_subscriptions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "owner_id" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "push_subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "push_subscriptions_endpoint_key" ON "push_subscriptions"("endpoint");

-- CreateIndex
CREATE INDEX "push_subscriptions_owner_id_idx" ON "push_subscriptions"("owner_id");

-- AlterTable
-- The due time a QStash message is waiting for, so the daily cron doesn't publish it again.
ALTER TABLE "reminders" ADD COLUMN "notify_scheduled_for" TIMESTAMPTZ(3);

-- CreateIndex
-- The cron's query: pending reminders by due time.
CREATE INDEX "reminders_status_due_at_idx" ON "reminders"("status", "due_at");

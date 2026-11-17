-- Rater reminders: sender name and reply-to on emails, per-rater notes, queued manual reminders,
-- saved reminder message, and a reminder history.
ALTER TABLE "Notification" ADD COLUMN "fromName" TEXT;
ALTER TABLE "Notification" ADD COLUMN "replyTo" TEXT;
ALTER TABLE "RaterInvite" ADD COLUMN "personalNote" TEXT;
ALTER TABLE "RaterInvite" ADD COLUMN "queuedReminder" JSONB;
ALTER TABLE "SubjectProfile" ADD COLUMN "reminderTemplate" TEXT;
ALTER TABLE "SubjectProfile" ADD COLUMN "reminderTone" TEXT;
CREATE TABLE "ReminderLog" (
    "id" TEXT NOT NULL,
    "assessmentId" TEXT,
    "inviteId" TEXT,
    "campaignId" TEXT,
    "memberId" TEXT,
    "sentById" TEXT,
    "kind" TEXT NOT NULL,
    "outcome" TEXT NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ReminderLog_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ReminderLog_assessmentId_createdAt_idx" ON "ReminderLog"("assessmentId", "createdAt");
CREATE INDEX "ReminderLog_campaignId_createdAt_idx" ON "ReminderLog"("campaignId", "createdAt");
CREATE INDEX "ReminderLog_inviteId_idx" ON "ReminderLog"("inviteId");

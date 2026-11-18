-- Age gate (birth dates are never stored) and terms acceptance.
ALTER TABLE "User" ADD COLUMN "ageConfirmedAt" TIMESTAMP(3), ADD COLUMN "termsAcceptedAt" TIMESTAMP(3), ADD COLUMN "ageBlockedAt" TIMESTAMP(3);

-- Unsubscribe: addresses that asked for no more non-essential emails.
CREATE TABLE "EmailSuppression" (
    "email" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'link',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EmailSuppression_pkey" PRIMARY KEY ("email")
);
ALTER TYPE "NotificationStatus" ADD VALUE 'SUPPRESSED';

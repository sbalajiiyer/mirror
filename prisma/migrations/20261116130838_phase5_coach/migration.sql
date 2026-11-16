-- CreateEnum
CREATE TYPE "CoachLinkStatus" AS ENUM ('PENDING', 'ACTIVE', 'DECLINED', 'REVOKED');

-- CreateTable
CREATE TABLE "CoachProfile" (
    "userId" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "brandName" TEXT,
    "brandColor" TEXT,
    "website" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CoachProfile_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "CoachClientLink" (
    "id" TEXT NOT NULL,
    "coachId" TEXT,
    "clientId" TEXT,
    "initiatedBy" TEXT NOT NULL,
    "inviteEmail" TEXT NOT NULL,
    "inviteTokenHash" TEXT,
    "status" "CoachLinkStatus" NOT NULL DEFAULT 'PENDING',
    "shareReports" BOOLEAN NOT NULL DEFAULT true,
    "shareComments" BOOLEAN NOT NULL DEFAULT false,
    "shareGoals" BOOLEAN NOT NULL DEFAULT true,
    "sharePlan" BOOLEAN NOT NULL DEFAULT false,
    "showBranding" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acceptedAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),

    CONSTRAINT "CoachClientLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CoachNote" (
    "id" TEXT NOT NULL,
    "coachId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CoachNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CoachMeeting" (
    "id" TEXT NOT NULL,
    "coachId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "topic" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CoachMeeting_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CoachClientLink_inviteTokenHash_key" ON "CoachClientLink"("inviteTokenHash");

-- CreateIndex
CREATE INDEX "CoachClientLink_coachId_status_idx" ON "CoachClientLink"("coachId", "status");

-- CreateIndex
CREATE INDEX "CoachClientLink_clientId_status_idx" ON "CoachClientLink"("clientId", "status");

-- CreateIndex
CREATE INDEX "CoachNote_coachId_clientId_idx" ON "CoachNote"("coachId", "clientId");

-- CreateIndex
CREATE INDEX "CoachMeeting_coachId_scheduledAt_idx" ON "CoachMeeting"("coachId", "scheduledAt");

-- CreateIndex
CREATE INDEX "CoachMeeting_clientId_scheduledAt_idx" ON "CoachMeeting"("clientId", "scheduledAt");

-- AddForeignKey
ALTER TABLE "CoachProfile" ADD CONSTRAINT "CoachProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoachClientLink" ADD CONSTRAINT "CoachClientLink_coachId_fkey" FOREIGN KEY ("coachId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoachClientLink" ADD CONSTRAINT "CoachClientLink_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoachNote" ADD CONSTRAINT "CoachNote_coachId_fkey" FOREIGN KEY ("coachId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoachMeeting" ADD CONSTRAINT "CoachMeeting_coachId_fkey" FOREIGN KEY ("coachId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoachMeeting" ADD CONSTRAINT "CoachMeeting_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

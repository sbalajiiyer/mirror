-- CreateEnum
CREATE TYPE "GoalStatus" AS ENUM ('ACTIVE', 'ACHIEVED', 'ARCHIVED');

-- AlterEnum
ALTER TYPE "AssessmentType" ADD VALUE 'PULSE';

-- AlterTable
ALTER TABLE "Assessment" ADD COLUMN     "cadenceMonths" INTEGER,
ADD COLUMN     "nextPulseDueAt" TIMESTAMP(3),
ADD COLUMN     "pulseReminderSentAt" TIMESTAMP(3),
ADD COLUMN     "rootAssessmentId" TEXT;

-- AlterTable
ALTER TABLE "Framework" ADD COLUMN     "ownerId" TEXT,
ADD COLUMN     "source" TEXT NOT NULL DEFAULT 'builtin',
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateTable
CREATE TABLE "Goal" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "assessmentId" TEXT NOT NULL,
    "competencyKey" TEXT NOT NULL,
    "competencyName" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "baseline" DOUBLE PRECISION,
    "target" DOUBLE PRECISION NOT NULL,
    "status" "GoalStatus" NOT NULL DEFAULT 'ACTIVE',
    "achievedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Goal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CreditLedger" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "delta" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "ref" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CreditLedger_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Goal_userId_idx" ON "Goal"("userId");

-- CreateIndex
CREATE INDEX "Goal_assessmentId_idx" ON "Goal"("assessmentId");

-- CreateIndex
CREATE INDEX "CreditLedger_userId_createdAt_idx" ON "CreditLedger"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "Assessment_rootAssessmentId_idx" ON "Assessment"("rootAssessmentId");

-- CreateIndex
CREATE INDEX "Framework_ownerId_idx" ON "Framework"("ownerId");

-- AddForeignKey
ALTER TABLE "Framework" ADD CONSTRAINT "Framework_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assessment" ADD CONSTRAINT "Assessment_rootAssessmentId_fkey" FOREIGN KEY ("rootAssessmentId") REFERENCES "Assessment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Goal" ADD CONSTRAINT "Goal_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Goal" ADD CONSTRAINT "Goal_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "Assessment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditLedger" ADD CONSTRAINT "CreditLedger_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

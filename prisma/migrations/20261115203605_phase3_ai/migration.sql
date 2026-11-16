-- AlterTable
ALTER TABLE "Report" ADD COLUMN     "aiSummary" JSONB;

-- AlterTable
ALTER TABLE "SubjectProfile" ADD COLUMN     "aiModel" TEXT NOT NULL DEFAULT 'free',
ADD COLUMN     "learningStyle" TEXT;

-- CreateTable
CREATE TABLE "DevelopmentPlan" (
    "id" TEXT NOT NULL,
    "assessmentId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "modelId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DevelopmentPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AIInteractionLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "actorKey" TEXT,
    "feature" TEXT NOT NULL,
    "modelId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "tier" TEXT NOT NULL,
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,
    "costMicros" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AIInteractionLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DevelopmentPlan_assessmentId_idx" ON "DevelopmentPlan"("assessmentId");

-- CreateIndex
CREATE INDEX "DevelopmentPlan_userId_idx" ON "DevelopmentPlan"("userId");

-- CreateIndex
CREATE INDEX "AIInteractionLog_userId_createdAt_idx" ON "AIInteractionLog"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "AIInteractionLog_actorKey_createdAt_idx" ON "AIInteractionLog"("actorKey", "createdAt");

-- AddForeignKey
ALTER TABLE "DevelopmentPlan" ADD CONSTRAINT "DevelopmentPlan_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "Assessment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DevelopmentPlan" ADD CONSTRAINT "DevelopmentPlan_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIInteractionLog" ADD CONSTRAINT "AIInteractionLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

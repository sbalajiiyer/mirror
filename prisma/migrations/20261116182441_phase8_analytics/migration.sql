-- CreateEnum
CREATE TYPE "DashboardScope" AS ENUM ('PERSONAL', 'COACH', 'ORG');

-- AlterTable
ALTER TABLE "SubjectProfile" ADD COLUMN     "benchmarkOptOut" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "BenchmarkNorm" (
    "id" TEXT NOT NULL,
    "frameworkSlug" TEXT NOT NULL,
    "competencyKey" TEXT NOT NULL,
    "slice" TEXT NOT NULL,
    "n" INTEGER NOT NULL,
    "mean" DOUBLE PRECISION NOT NULL,
    "p10" DOUBLE PRECISION NOT NULL,
    "p25" DOUBLE PRECISION NOT NULL,
    "p50" DOUBLE PRECISION NOT NULL,
    "p75" DOUBLE PRECISION NOT NULL,
    "p90" DOUBLE PRECISION NOT NULL,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BenchmarkNorm_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Dashboard" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "scope" "DashboardScope" NOT NULL DEFAULT 'PERSONAL',
    "orgId" TEXT,
    "name" TEXT NOT NULL,
    "widgets" JSONB NOT NULL DEFAULT '[]',
    "schedule" TEXT,
    "scheduleDay" INTEGER,
    "lastSentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Dashboard_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApiToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "prefix" TEXT NOT NULL,
    "lastUsedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApiToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BenchmarkNorm_frameworkSlug_competencyKey_slice_key" ON "BenchmarkNorm"("frameworkSlug", "competencyKey", "slice");

-- CreateIndex
CREATE INDEX "Dashboard_ownerId_idx" ON "Dashboard"("ownerId");

-- CreateIndex
CREATE UNIQUE INDEX "ApiToken_tokenHash_key" ON "ApiToken"("tokenHash");

-- CreateIndex
CREATE INDEX "ApiToken_userId_idx" ON "ApiToken"("userId");

-- AddForeignKey
ALTER TABLE "Dashboard" ADD CONSTRAINT "Dashboard_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApiToken" ADD CONSTRAINT "ApiToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

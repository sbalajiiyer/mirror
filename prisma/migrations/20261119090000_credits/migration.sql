-- Credits: $1 = 1 credit, stored in hundredths. One wallet per workspace (personal or company).
ALTER TABLE "Workspace" ADD COLUMN "credits" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Assessment" ADD COLUMN "billing" TEXT, ADD COLUMN "chargedCredits" INTEGER, ADD COLUMN "chargedAt" TIMESTAMP(3);
ALTER TABLE "AIInteractionLog" ADD COLUMN "charged" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "CreditLedger" ADD COLUMN "balanceAfter" INTEGER, ADD COLUMN "orgId" TEXT;

CREATE TABLE "PricingPolicy" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "survey360" INTEGER NOT NULL DEFAULT 4900,
    "followUp" INTEGER NOT NULL DEFAULT 4900,
    "pulse" INTEGER NOT NULL DEFAULT 900,
    "coachGift" INTEGER NOT NULL DEFAULT 3500,
    "companyParticipant" INTEGER NOT NULL DEFAULT 1200,
    "companyWelcomeCredits" INTEGER NOT NULL DEFAULT 12000,
    "freeSurveys" INTEGER NOT NULL DEFAULT 1,
    "premiumMarkupPct" INTEGER NOT NULL DEFAULT 200,
    "cardFeeBps" INTEGER NOT NULL DEFAULT 290,
    "cardFeeFixedCents" INTEGER NOT NULL DEFAULT 30,
    "otherFeeBps" INTEGER NOT NULL DEFAULT 0,
    "otherFeeFixedCents" INTEGER NOT NULL DEFAULT 0,
    "minTopUp" INTEGER NOT NULL DEFAULT 1,
    "maxTopUp" INTEGER NOT NULL DEFAULT 10000,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedById" TEXT,
    CONSTRAINT "PricingPolicy_pkey" PRIMARY KEY ("id")
);
INSERT INTO "PricingPolicy" ("id") VALUES ('default');

CREATE TABLE "PriceDiscount" (
    "id" TEXT NOT NULL,
    "orgId" TEXT,
    "userId" TEXT,
    "percent" INTEGER NOT NULL,
    "scope" TEXT NOT NULL DEFAULT 'ALL',
    "note" TEXT,
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),
    CONSTRAINT "PriceDiscount_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "PriceDiscount_orgId_idx" ON "PriceDiscount"("orgId");
CREATE INDEX "PriceDiscount_userId_idx" ON "PriceDiscount"("userId");
ALTER TABLE "PriceDiscount" ADD CONSTRAINT "PriceDiscount_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PriceDiscount" ADD CONSTRAINT "PriceDiscount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Sessions already launched keep working as before; drafts are charged when they launch.
UPDATE "Assessment" SET "billing" = 'GRANDFATHERED' WHERE "status" NOT IN ('DRAFT', 'READY');

-- Old ledger rows were whole old credits (bought at ~$4 each): restate in hundredths of new credits.
UPDATE "CreditLedger" SET "delta" = "delta" * 400;

-- Convert what people already hold into credits.
WITH old AS (
  SELECT w."id" AS ws, w."ownerId" AS uid,
    COALESCE((SELECT p."aiCredits" FROM "SubjectProfile" p WHERE p."userId" = w."ownerId"), 0) * 400
    + COALESCE((SELECT SUM(e."remaining") FROM "Entitlement" e WHERE e."userId" = w."ownerId" AND e."kind" = 'full_360' AND e."source" <> 'coach_gift'), 0) * 4900
    + COALESCE((SELECT SUM(e."remaining") FROM "Entitlement" e WHERE e."userId" = w."ownerId" AND e."kind" = 'coach_report_credit'), 0) * 3500 AS amount
  FROM "Workspace" w WHERE w."kind" = 'PERSONAL' AND w."ownerId" IS NOT NULL
)
INSERT INTO "CreditLedger" ("id", "userId", "delta", "reason", "ref", "workspaceId", "balanceAfter")
SELECT gen_random_uuid()::text, uid, amount, 'conversion', 'credits-launch', ws, amount FROM old WHERE amount > 0;
UPDATE "Workspace" w SET "credits" = l."delta" FROM "CreditLedger" l WHERE l."workspaceId" = w."id" AND l."reason" = 'conversion' AND l."ref" = 'credits-launch';

WITH orgs AS (
  SELECT w."id" AS ws, o."id" AS oid, o."seats" * 1200 AS amount,
    (SELECT m."userId" FROM "OrgMember" m JOIN "User" u ON u."id" = m."userId" WHERE m."orgId" = o."id" ORDER BY (m."role" = 'OWNER') DESC, m."id" LIMIT 1) AS uid
  FROM "Workspace" w JOIN "Organization" o ON o."id" = w."orgId" WHERE w."kind" = 'COMPANY'
)
INSERT INTO "CreditLedger" ("id", "userId", "delta", "reason", "ref", "workspaceId", "balanceAfter", "orgId")
SELECT gen_random_uuid()::text, uid, amount, 'conversion', 'credits-launch-seats', ws, amount, oid FROM orgs WHERE amount > 0 AND uid IS NOT NULL;
UPDATE "Workspace" w SET "credits" = l."delta" FROM "CreditLedger" l WHERE l."workspaceId" = w."id" AND l."reason" = 'conversion' AND l."ref" = 'credits-launch-seats';

UPDATE "SubjectProfile" SET "aiCredits" = 0;
UPDATE "Entitlement" SET "remaining" = 0 WHERE ("kind" = 'full_360' AND "source" <> 'coach_gift') OR "kind" = 'coach_report_credit';
UPDATE "Organization" SET "seats" = 0;
ALTER TABLE "Organization" ALTER COLUMN "seats" SET DEFAULT 0;

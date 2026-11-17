-- Phase 11a: personal and company workspaces.
-- Every content row gets a workspace. A BEFORE INSERT trigger fills "workspaceId" when the app
-- doesn't pass one, so existing code keeps working; later steps pass it explicitly.

CREATE TYPE "WorkspaceKind" AS ENUM ('PERSONAL', 'COMPANY');

CREATE TABLE "Workspace" (
    "id" TEXT NOT NULL,
    "kind" "WorkspaceKind" NOT NULL,
    "ownerId" TEXT,
    "orgId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Workspace_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "Workspace_one_owner" CHECK (("kind" = 'PERSONAL' AND "ownerId" IS NOT NULL AND "orgId" IS NULL) OR ("kind" = 'COMPANY' AND "orgId" IS NOT NULL AND "ownerId" IS NULL))
);
CREATE UNIQUE INDEX "Workspace_ownerId_key" ON "Workspace"("ownerId");
CREATE UNIQUE INDEX "Workspace_orgId_key" ON "Workspace"("orgId");
ALTER TABLE "Workspace" ADD CONSTRAINT "Workspace_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Workspace" ADD CONSTRAINT "Workspace_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Get-or-create helpers (safe under concurrency thanks to the unique indexes).
CREATE OR REPLACE FUNCTION mirror_personal_ws(uid TEXT) RETURNS TEXT LANGUAGE plpgsql AS $$
DECLARE wid TEXT;
BEGIN
  IF uid IS NULL THEN RETURN NULL; END IF;
  SELECT "id" INTO wid FROM "Workspace" WHERE "ownerId" = uid;
  IF wid IS NULL THEN
    INSERT INTO "Workspace" ("id", "kind", "ownerId") VALUES ('ws_' || replace(gen_random_uuid()::text, '-', ''), 'PERSONAL', uid)
    ON CONFLICT ("ownerId") DO NOTHING;
    SELECT "id" INTO wid FROM "Workspace" WHERE "ownerId" = uid;
  END IF;
  RETURN wid;
END $$;

CREATE OR REPLACE FUNCTION mirror_company_ws(oid TEXT) RETURNS TEXT LANGUAGE plpgsql AS $$
DECLARE wid TEXT;
BEGIN
  IF oid IS NULL THEN RETURN NULL; END IF;
  SELECT "id" INTO wid FROM "Workspace" WHERE "orgId" = oid;
  IF wid IS NULL THEN
    INSERT INTO "Workspace" ("id", "kind", "orgId") VALUES ('ws_' || replace(gen_random_uuid()::text, '-', ''), 'COMPANY', oid)
    ON CONFLICT ("orgId") DO NOTHING;
    SELECT "id" INTO wid FROM "Workspace" WHERE "orgId" = oid;
  END IF;
  RETURN wid;
END $$;

-- New users and organizations get their workspace immediately.
CREATE OR REPLACE FUNCTION mirror_user_ws_trg() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN PERFORM mirror_personal_ws(NEW."id"); RETURN NULL; END $$;
CREATE TRIGGER "User_personal_workspace" AFTER INSERT ON "User" FOR EACH ROW EXECUTE FUNCTION mirror_user_ws_trg();

CREATE OR REPLACE FUNCTION mirror_org_ws_trg() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN PERFORM mirror_company_ws(NEW."id"); RETURN NULL; END $$;
CREATE TRIGGER "Organization_company_workspace" AFTER INSERT ON "Organization" FOR EACH ROW EXECUTE FUNCTION mirror_org_ws_trg();

-- Columns (nullable until the backfill below has run).

ALTER TABLE "Assessment" ADD COLUMN "workspaceId" TEXT;
ALTER TABLE "DevelopmentPlan" ADD COLUMN "workspaceId" TEXT;
ALTER TABLE "Goal" ADD COLUMN "workspaceId" TEXT;
ALTER TABLE "CoachChat" ADD COLUMN "workspaceId" TEXT;
ALTER TABLE "Dashboard" ADD COLUMN "workspaceId" TEXT;
ALTER TABLE "ShareLink" ADD COLUMN "workspaceId" TEXT;
ALTER TABLE "ApiToken" ADD COLUMN "workspaceId" TEXT;
ALTER TABLE "CreditLedger" ADD COLUMN "workspaceId" TEXT;
ALTER TABLE "Subscription" ADD COLUMN "workspaceId" TEXT;
ALTER TABLE "Payment" ADD COLUMN "workspaceId" TEXT;
ALTER TABLE "Entitlement" ADD COLUMN "workspaceId" TEXT;
ALTER TABLE "Framework" ADD COLUMN "workspaceId" TEXT;
ALTER TABLE "AIInteractionLog" ADD COLUMN "workspaceId" TEXT;
ALTER TABLE "Assessment" ADD COLUMN "roundContributedAt" TIMESTAMP(3);

-- Default workspace when the app does not pass one.
CREATE OR REPLACE FUNCTION mirror_ws_default_assessment() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."workspaceId" IS NULL THEN NEW."workspaceId" := CASE WHEN NEW."orgCampaignId" IS NOT NULL THEN mirror_company_ws((SELECT "orgId" FROM "OrgCampaign" WHERE "id" = NEW."orgCampaignId")) ELSE mirror_personal_ws(NEW."subjectId") END; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "Assessment_default_workspace" BEFORE INSERT ON "Assessment" FOR EACH ROW EXECUTE FUNCTION mirror_ws_default_assessment();

CREATE OR REPLACE FUNCTION mirror_ws_default_developmentplan() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."workspaceId" IS NULL THEN NEW."workspaceId" := (SELECT "workspaceId" FROM "Assessment" WHERE "id" = NEW."assessmentId"); END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "DevelopmentPlan_default_workspace" BEFORE INSERT ON "DevelopmentPlan" FOR EACH ROW EXECUTE FUNCTION mirror_ws_default_developmentplan();

CREATE OR REPLACE FUNCTION mirror_ws_default_goal() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."workspaceId" IS NULL THEN NEW."workspaceId" := (SELECT "workspaceId" FROM "Assessment" WHERE "id" = NEW."assessmentId"); END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "Goal_default_workspace" BEFORE INSERT ON "Goal" FOR EACH ROW EXECUTE FUNCTION mirror_ws_default_goal();

CREATE OR REPLACE FUNCTION mirror_ws_default_sharelink() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."workspaceId" IS NULL THEN NEW."workspaceId" := (SELECT "workspaceId" FROM "Assessment" WHERE "id" = NEW."assessmentId"); END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "ShareLink_default_workspace" BEFORE INSERT ON "ShareLink" FOR EACH ROW EXECUTE FUNCTION mirror_ws_default_sharelink();

CREATE OR REPLACE FUNCTION mirror_ws_default_coachchat() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."workspaceId" IS NULL THEN NEW."workspaceId" := COALESCE((SELECT "workspaceId" FROM "Assessment" WHERE "id" = NEW."assessmentId"), mirror_personal_ws(NEW."userId")); END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "CoachChat_default_workspace" BEFORE INSERT ON "CoachChat" FOR EACH ROW EXECUTE FUNCTION mirror_ws_default_coachchat();

CREATE OR REPLACE FUNCTION mirror_ws_default_dashboard() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."workspaceId" IS NULL THEN NEW."workspaceId" := CASE WHEN NEW."scope" = 'ORG' AND NEW."orgId" IS NOT NULL THEN mirror_company_ws(NEW."orgId") ELSE mirror_personal_ws(NEW."ownerId") END; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "Dashboard_default_workspace" BEFORE INSERT ON "Dashboard" FOR EACH ROW EXECUTE FUNCTION mirror_ws_default_dashboard();

CREATE OR REPLACE FUNCTION mirror_ws_default_framework() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."workspaceId" IS NULL THEN NEW."workspaceId" := mirror_personal_ws(NEW."ownerId"); END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "Framework_default_workspace" BEFORE INSERT ON "Framework" FOR EACH ROW EXECUTE FUNCTION mirror_ws_default_framework();

CREATE OR REPLACE FUNCTION mirror_ws_default_aiinteractionlog() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."workspaceId" IS NULL THEN NEW."workspaceId" := mirror_personal_ws(NEW."userId"); END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "AIInteractionLog_default_workspace" BEFORE INSERT ON "AIInteractionLog" FOR EACH ROW EXECUTE FUNCTION mirror_ws_default_aiinteractionlog();

CREATE OR REPLACE FUNCTION mirror_ws_default_apitoken() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."workspaceId" IS NULL THEN NEW."workspaceId" := mirror_personal_ws(NEW."userId"); END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "ApiToken_default_workspace" BEFORE INSERT ON "ApiToken" FOR EACH ROW EXECUTE FUNCTION mirror_ws_default_apitoken();

CREATE OR REPLACE FUNCTION mirror_ws_default_creditledger() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."workspaceId" IS NULL THEN NEW."workspaceId" := mirror_personal_ws(NEW."userId"); END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "CreditLedger_default_workspace" BEFORE INSERT ON "CreditLedger" FOR EACH ROW EXECUTE FUNCTION mirror_ws_default_creditledger();

CREATE OR REPLACE FUNCTION mirror_ws_default_subscription() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."workspaceId" IS NULL THEN NEW."workspaceId" := mirror_personal_ws(NEW."userId"); END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "Subscription_default_workspace" BEFORE INSERT ON "Subscription" FOR EACH ROW EXECUTE FUNCTION mirror_ws_default_subscription();

CREATE OR REPLACE FUNCTION mirror_ws_default_entitlement() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."workspaceId" IS NULL THEN NEW."workspaceId" := mirror_personal_ws(NEW."userId"); END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "Entitlement_default_workspace" BEFORE INSERT ON "Entitlement" FOR EACH ROW EXECUTE FUNCTION mirror_ws_default_entitlement();

CREATE OR REPLACE FUNCTION mirror_ws_default_payment() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."workspaceId" IS NULL THEN NEW."workspaceId" := CASE WHEN NEW."context" ? 'orgId' AND EXISTS (SELECT 1 FROM "Organization" WHERE "id" = NEW."context"->>'orgId') THEN mirror_company_ws(NEW."context"->>'orgId') ELSE mirror_personal_ws(NEW."userId") END; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "Payment_default_workspace" BEFORE INSERT ON "Payment" FOR EACH ROW EXECUTE FUNCTION mirror_ws_default_payment();

-- Backfill (idempotent: only rows without a workspace are touched).
SELECT mirror_personal_ws("id") FROM "User";
SELECT mirror_company_ws("id") FROM "Organization";

UPDATE "Assessment" t SET "workspaceId" = CASE WHEN t."orgCampaignId" IS NOT NULL THEN mirror_company_ws((SELECT "orgId" FROM "OrgCampaign" WHERE "id" = t."orgCampaignId")) ELSE mirror_personal_ws(t."subjectId") END WHERE t."workspaceId" IS NULL;
UPDATE "DevelopmentPlan" t SET "workspaceId" = (SELECT "workspaceId" FROM "Assessment" WHERE "id" = t."assessmentId") WHERE t."workspaceId" IS NULL;
UPDATE "Goal" t SET "workspaceId" = (SELECT "workspaceId" FROM "Assessment" WHERE "id" = t."assessmentId") WHERE t."workspaceId" IS NULL;
UPDATE "ShareLink" t SET "workspaceId" = (SELECT "workspaceId" FROM "Assessment" WHERE "id" = t."assessmentId") WHERE t."workspaceId" IS NULL;
UPDATE "CoachChat" t SET "workspaceId" = COALESCE((SELECT "workspaceId" FROM "Assessment" WHERE "id" = t."assessmentId"), mirror_personal_ws(t."userId")) WHERE t."workspaceId" IS NULL;
UPDATE "Dashboard" t SET "workspaceId" = CASE WHEN t."scope" = 'ORG' AND t."orgId" IS NOT NULL THEN mirror_company_ws(t."orgId") ELSE mirror_personal_ws(t."ownerId") END WHERE t."workspaceId" IS NULL;
UPDATE "Framework" t SET "workspaceId" = mirror_personal_ws(t."ownerId") WHERE t."workspaceId" IS NULL;
UPDATE "AIInteractionLog" t SET "workspaceId" = mirror_personal_ws(t."userId") WHERE t."workspaceId" IS NULL;
UPDATE "ApiToken" t SET "workspaceId" = mirror_personal_ws(t."userId") WHERE t."workspaceId" IS NULL;
UPDATE "CreditLedger" t SET "workspaceId" = mirror_personal_ws(t."userId") WHERE t."workspaceId" IS NULL;
UPDATE "Subscription" t SET "workspaceId" = mirror_personal_ws(t."userId") WHERE t."workspaceId" IS NULL;
UPDATE "Entitlement" t SET "workspaceId" = mirror_personal_ws(t."userId") WHERE t."workspaceId" IS NULL;
UPDATE "Payment" t SET "workspaceId" = CASE WHEN t."context" ? 'orgId' AND EXISTS (SELECT 1 FROM "Organization" WHERE "id" = t."context"->>'orgId') THEN mirror_company_ws(t."context"->>'orgId') ELSE mirror_personal_ws(t."userId") END WHERE t."workspaceId" IS NULL;

ALTER TABLE "Assessment" ALTER COLUMN "workspaceId" SET NOT NULL;
ALTER TABLE "DevelopmentPlan" ALTER COLUMN "workspaceId" SET NOT NULL;
ALTER TABLE "Goal" ALTER COLUMN "workspaceId" SET NOT NULL;
ALTER TABLE "CoachChat" ALTER COLUMN "workspaceId" SET NOT NULL;
ALTER TABLE "Dashboard" ALTER COLUMN "workspaceId" SET NOT NULL;
ALTER TABLE "ShareLink" ALTER COLUMN "workspaceId" SET NOT NULL;
ALTER TABLE "ApiToken" ALTER COLUMN "workspaceId" SET NOT NULL;
ALTER TABLE "CreditLedger" ALTER COLUMN "workspaceId" SET NOT NULL;
ALTER TABLE "Subscription" ALTER COLUMN "workspaceId" SET NOT NULL;
ALTER TABLE "Payment" ALTER COLUMN "workspaceId" SET NOT NULL;
ALTER TABLE "Entitlement" ALTER COLUMN "workspaceId" SET NOT NULL;

CREATE INDEX "Assessment_workspaceId_idx" ON "Assessment"("workspaceId");
ALTER TABLE "Assessment" ADD CONSTRAINT "Assessment_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE INDEX "DevelopmentPlan_workspaceId_idx" ON "DevelopmentPlan"("workspaceId");
ALTER TABLE "DevelopmentPlan" ADD CONSTRAINT "DevelopmentPlan_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE INDEX "Goal_workspaceId_idx" ON "Goal"("workspaceId");
ALTER TABLE "Goal" ADD CONSTRAINT "Goal_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE INDEX "CoachChat_workspaceId_idx" ON "CoachChat"("workspaceId");
ALTER TABLE "CoachChat" ADD CONSTRAINT "CoachChat_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE INDEX "Dashboard_workspaceId_idx" ON "Dashboard"("workspaceId");
ALTER TABLE "Dashboard" ADD CONSTRAINT "Dashboard_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE INDEX "ShareLink_workspaceId_idx" ON "ShareLink"("workspaceId");
ALTER TABLE "ShareLink" ADD CONSTRAINT "ShareLink_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE INDEX "ApiToken_workspaceId_idx" ON "ApiToken"("workspaceId");
ALTER TABLE "ApiToken" ADD CONSTRAINT "ApiToken_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE INDEX "CreditLedger_workspaceId_idx" ON "CreditLedger"("workspaceId");
ALTER TABLE "CreditLedger" ADD CONSTRAINT "CreditLedger_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE INDEX "Subscription_workspaceId_idx" ON "Subscription"("workspaceId");
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE INDEX "Payment_workspaceId_idx" ON "Payment"("workspaceId");
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE INDEX "Entitlement_workspaceId_idx" ON "Entitlement"("workspaceId");
ALTER TABLE "Entitlement" ADD CONSTRAINT "Entitlement_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE INDEX "Framework_workspaceId_idx" ON "Framework"("workspaceId");
ALTER TABLE "Framework" ADD CONSTRAINT "Framework_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE INDEX "AIInteractionLog_workspaceId_idx" ON "AIInteractionLog"("workspaceId");
ALTER TABLE "AIInteractionLog" ADD CONSTRAINT "AIInteractionLog_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Frozen, anonymous round totals.
CREATE TABLE "RoundResult" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "people" INTEGER NOT NULL DEFAULT 0,
    "competencies" JSONB NOT NULL DEFAULT '{}',
    "overallN" INTEGER NOT NULL DEFAULT 0,
    "overallSum" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "RoundResult_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "RoundResult_campaignId_scope_key" ON "RoundResult"("campaignId", "scope");
CREATE INDEX "RoundResult_orgId_idx" ON "RoundResult"("orgId");
ALTER TABLE "RoundResult" ADD CONSTRAINT "RoundResult_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

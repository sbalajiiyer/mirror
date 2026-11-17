-- Phase 11e: every organization gets an owner: its creator if still an active admin,
-- otherwise its longest-standing active admin.
UPDATE "OrgMember" m SET "role" = 'OWNER'
FROM "Organization" o
WHERE m."orgId" = o."id" AND m."userId" = o."createdById" AND m."status" = 'ACTIVE' AND m."role" = 'ADMIN';

UPDATE "OrgMember" m SET "role" = 'OWNER'
WHERE m."id" IN (
  SELECT DISTINCT ON (a."orgId") a."id"
  FROM "OrgMember" a
  WHERE a."status" = 'ACTIVE' AND a."role" = 'ADMIN'
    AND NOT EXISTS (SELECT 1 FROM "OrgMember" x WHERE x."orgId" = a."orgId" AND x."role" = 'OWNER' AND x."status" = 'ACTIVE')
  ORDER BY a."orgId", a."joinedAt" ASC NULLS LAST, a."invitedAt" ASC
);

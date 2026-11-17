-- Phase 11e: Owner and Analyst roles. (New enum values are used in the next migration.)
ALTER TYPE "OrgRole" ADD VALUE IF NOT EXISTS 'OWNER';
ALTER TYPE "OrgRole" ADD VALUE IF NOT EXISTS 'ANALYST';

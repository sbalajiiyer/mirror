-- Phase 11e: premium AI models a company allows (the free model is always allowed).
ALTER TABLE "Organization" ADD COLUMN "allowedAiModels" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- Anonymous funnel counts: when the subject first opened the report. No tracking, just this timestamp.
ALTER TABLE "Assessment" ADD COLUMN "reportViewedAt" TIMESTAMP(3);

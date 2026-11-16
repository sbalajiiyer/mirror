import "server-only";
import { db } from "@/lib/db";
import { isRegion, type Region } from "@/lib/residency";

/** Region of an assessment's data: its org round's organization, otherwise "us". */
export async function regionForAssessment(assessmentId: string | null | undefined): Promise<Region> {
  if (!assessmentId) return "us";
  const a = await db.assessment.findUnique({ where: { id: assessmentId }, select: { orgCampaign: { select: { org: { select: { region: true } } } } } });
  const r = a?.orgCampaign?.org.region;
  return isRegion(r) ? r : "us";
}

export async function regionForOrg(orgId: string | null | undefined): Promise<Region> {
  if (!orgId) return "us";
  const o = await db.organization.findUnique({ where: { id: orgId }, select: { region: true } });
  return isRegion(o?.region) ? o!.region as Region : "us";
}

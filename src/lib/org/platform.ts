/**
 * Company plan (Phase 11e). A company pays a monthly platform fee plus seats. New companies get a
 * free trial. Isomorphic and pure so pages, services and tests share it.
 */
export const COMPANY_TRIAL_DAYS = 30;
const DAY = 24 * 3600 * 1000;

export type PlatformStatus = { active: boolean; trial: boolean; until: Date };

export function platformStatus(org: { createdAt: Date; platformPaidUntil: Date | null }, now = new Date()): PlatformStatus {
  const trialEnd = new Date(org.createdAt.getTime() + COMPANY_TRIAL_DAYS * DAY);
  const paid = org.platformPaidUntil;
  if (paid && paid > now && paid >= trialEnd) return { active: true, trial: false, until: paid };
  if (trialEnd > now) return { active: true, trial: true, until: paid && paid > trialEnd ? paid : trialEnd };
  return { active: !!paid && paid > now, trial: false, until: paid ?? trialEnd };
}

/** New paid-until date after buying `days` more: from today, or from the current end if still active. */
export function extendPlatform(org: { createdAt: Date; platformPaidUntil: Date | null }, days: number, now = new Date()) {
  const s = platformStatus(org, now);
  const from = s.active ? s.until : now;
  return new Date(from.getTime() + days * DAY);
}

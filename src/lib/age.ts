/**
 * Neutral age screen (FTC guidance): ask for birth month and year without hinting at the minimum
 * age, and don't let someone simply go back and try again. The month and year are never stored;
 * only the outcome is. Pure and isomorphic.
 */
export const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"] as const;

/** Age in whole years on `now` for someone born in `month` (1-12) of `year`; assumes the last day of that month, so it never overstates. */
export function ageFrom(year: number, month: number, now = new Date()) {
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth() + 1;
  return y - year - (m > month ? 0 : 1);
}

export function isOldEnough(year: number, month: number, minimum: number, now = new Date()) {
  return ageFrom(year, month, now) >= minimum;
}

/** Years shown in the picker: the last 100 years, newest first (includes years below the minimum, so it stays neutral). */
export function birthYears(now = new Date()) {
  const y = now.getUTCFullYear();
  return Array.from({ length: 100 }, (_, i) => y - i);
}

export const AGE_BLOCK_COOKIE = "mirror-age-check";

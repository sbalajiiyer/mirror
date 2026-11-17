import { describe, expect, it } from "vitest";
import { COMPANY_TRIAL_DAYS, extendPlatform, platformStatus } from "@/lib/org/platform";

const DAY = 24 * 3600 * 1000;
const now = new Date("2026-11-17T12:00:00Z");
const ago = (d: number) => new Date(now.getTime() - d * DAY);
const ahead = (d: number) => new Date(now.getTime() + d * DAY);

describe("company plan", () => {
  it("gives new companies a free trial", () => {
    expect(platformStatus({ createdAt: ago(5), platformPaidUntil: null }, now)).toEqual({ active: true, trial: true, until: ahead(COMPANY_TRIAL_DAYS - 5) });
  });
  it("ends after the trial unless paid", () => {
    expect(platformStatus({ createdAt: ago(40), platformPaidUntil: null }, now).active).toBe(false);
    expect(platformStatus({ createdAt: ago(40), platformPaidUntil: ahead(3) }, now)).toEqual({ active: true, trial: false, until: ahead(3) });
    expect(platformStatus({ createdAt: ago(40), platformPaidUntil: ago(1) }, now).active).toBe(false);
  });
  it("adds a month from the current end while active, from today once ended", () => {
    expect(extendPlatform({ createdAt: ago(40), platformPaidUntil: ahead(10) }, 30, now)).toEqual(ahead(40));
    expect(extendPlatform({ createdAt: ago(40), platformPaidUntil: ago(10) }, 30, now)).toEqual(ahead(30));
    // During the trial, paying extends from the end of the trial.
    expect(extendPlatform({ createdAt: ago(10), platformPaidUntil: null }, 30, now)).toEqual(ahead(COMPANY_TRIAL_DAYS - 10 + 30));
  });
});

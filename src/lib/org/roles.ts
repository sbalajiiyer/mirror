/**
 * Company roles (Phase 11e). Isomorphic so pages, menus and services share one definition.
 *
 * - OWNER: everything, including sign-in (SSO), data region and retention, billing, roles.
 * - ADMIN: people, teams, rounds, talent grid, audit log; group results; individual reports only if shared.
 * - ANALYST: read-only group results and company dashboards.
 * - MEMBER: takes part in rounds and sees their own reports.
 */
export const ORG_ROLES = ["MEMBER", "ANALYST", "ADMIN", "OWNER"] as const;
export type CompanyRole = (typeof ORG_ROLES)[number];

export const ROLE_LABEL: Record<CompanyRole, string> = { MEMBER: "Member", ANALYST: "Analyst", ADMIN: "Admin", OWNER: "Owner" };
export const ROLE_HELP: Record<CompanyRole, string> = {
  MEMBER: "Takes part in rounds and sees their own reports.",
  ANALYST: "Read-only group results and company dashboards.",
  ADMIN: "Manages people, teams and rounds. Sees group results.",
  OWNER: "Everything, including sign-in, data settings, billing and roles.",
};

export const atLeast = (role: string, min: CompanyRole) => ORG_ROLES.indexOf(role as CompanyRole) >= ORG_ROLES.indexOf(min);

/** Lowest role that may open each company page. */
export const TAB_ROLE = {
  overview: "ANALYST",
  analytics: "ANALYST",
  people: "ADMIN",
  groups: "ADMIN",
  rounds: "ADMIN",
  talent: "ADMIN",
  audit: "ADMIN",
  billing: "OWNER",
  settings: "OWNER",
} as const satisfies Record<string, CompanyRole>;

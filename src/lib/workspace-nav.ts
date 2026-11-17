/**
 * Menu per workspace and role (Phase 11, plan §6). Pure, so it can be unit tested.
 */
export type NavInput = { kind: "PERSONAL" | "COMPANY"; orgId: string | null; admin: boolean; isCoach: boolean };
export type NavLink = { href: string; label: string };

export function navFor(w: NavInput): NavLink[] {
  if (w.kind === "PERSONAL") {
    return [
      { href: "/dashboard", label: "My 360s" },
      { href: "/progress", label: "Progress" },
      { href: "/questionnaires", label: "Questionnaires" },
      { href: "/dashboards", label: "Dashboards" },
      { href: "/chat", label: "AI coach" },
      { href: w.isCoach ? "/coach" : "/coaching", label: w.isCoach ? "Coach" : "Coaching" },
      { href: "/billing", label: "Billing" },
      { href: "/settings", label: "Settings" },
    ];
  }
  const org = `/orgs/${w.orgId}`;
  return [
    { href: "/dashboard", label: "My rounds" },
    { href: "/progress", label: "Progress" },
    { href: "/chat", label: "AI coach" },
    ...(w.admin
      ? [
          { href: org, label: "Company" },
          { href: "/dashboards", label: "Dashboards" },
        ]
      : []),
    { href: "/settings", label: "Settings" },
  ];
}

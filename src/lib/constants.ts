import type { RaterGroupKind } from "@prisma/client";

export const GOALS = [
  { key: "promotion", label: "Get promoted", hint: "Show what's ready and what's missing for the next level." },
  { key: "new_role", label: "Succeed in a new role", hint: "Calibrate early on how you're landing." },
  { key: "leadership_growth", label: "Grow as a leader", hint: "Understand your leadership impact." },
  { key: "career_change", label: "Change careers", hint: "Find transferable strengths." },
  { key: "self_awareness", label: "Know myself better", hint: "Close the gap between how you see yourself and how others do." },
] as const;
export type GoalKey = (typeof GOALS)[number]["key"];
export const GOAL_KEYS = GOALS.map((g) => g.key) as [GoalKey, ...GoalKey[]];
export const goalLabel = (key: string) => GOALS.find((g) => g.key === key)?.label ?? key;

export const RATER_GROUP_KINDS: { kind: Exclude<RaterGroupKind, "SELF">; label: string; hint: string }[] = [
  { kind: "MANAGER", label: "Manager", hint: "Your manager or someone you report to." },
  { kind: "PEER", label: "Peers", hint: "People you work alongside." },
  { kind: "DIRECT_REPORT", label: "Direct reports", hint: "People who report to you." },
  { kind: "CLIENT", label: "Clients", hint: "Customers, clients or stakeholders." },
  { kind: "OTHER", label: "Others", hint: "Anyone else: mentors, friends, classmates." },
];

export const groupKindLabel = (kind: RaterGroupKind) =>
  kind === "SELF" ? "Self" : (RATER_GROUP_KINDS.find((g) => g.kind === kind)?.label ?? kind);

export const SENIORITY = ["Student", "Entry level", "Mid level", "Senior", "Lead / principal", "Manager", "Director", "Executive", "Founder"] as const;

export const DEFAULT_INVITE_MESSAGE = (firstName: string) =>
  `Hi! I'm collecting honest, anonymous feedback to help me grow. It takes about 8 minutes, and your individual answers are never shown to me — I only see results combined with at least two other people. Thank you for helping. — ${firstName}`;

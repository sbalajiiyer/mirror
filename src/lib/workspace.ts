import "server-only";
import { cookies } from "next/headers";
import type { OrgRole } from "@prisma/client";
import { db } from "@/lib/db";
import { DomainError } from "@/lib/errors";

/**
 * Phase 11: personal and company workspaces.
 *
 * The active workspace is remembered in a cookie as "personal" or "org:<orgId>". The cookie is only a
 * preference: membership is checked on the server every time it is read, so a forged value falls
 * back to Personal.
 */
export const WORKSPACE_COOKIE = "mirror-ws";

export type WorkspaceRole = "OWNER" | OrgRole;
export type WorkspaceSummary = {
  id: string;
  kind: "PERSONAL" | "COMPANY";
  /** Cookie value for this workspace. */
  key: string;
  name: string;
  orgId: string | null;
  role: WorkspaceRole;
};

const RANK: Record<WorkspaceRole, number> = { MEMBER: 1, ADMIN: 2, OWNER: 3 };

/** Personal first, then each company the user is an active member of. */
export async function listWorkspaces(userId: string): Promise<WorkspaceSummary[]> {
  const personal =
    (await db.workspace.findUnique({ where: { ownerId: userId }, select: { id: true } })) ??
    (await db.workspace.upsert({ where: { ownerId: userId }, create: { kind: "PERSONAL", ownerId: userId }, update: {}, select: { id: true } }));
  const memberships = await db.orgMember.findMany({
    where: { userId, status: "ACTIVE" },
    select: { role: true, org: { select: { id: true, name: true, workspace: { select: { id: true } } } } },
    orderBy: { joinedAt: "asc" },
  });
  return [
    { id: personal.id, kind: "PERSONAL", key: "personal", name: "Personal", orgId: null, role: "OWNER" },
    ...memberships
      .filter((m) => m.org.workspace)
      .map((m) => ({ id: m.org.workspace!.id, kind: "COMPANY" as const, key: `org:${m.org.id}`, name: m.org.name, orgId: m.org.id, role: m.role })),
  ];
}

/** The workspace the user is working in, from the cookie, validated against their memberships. */
export async function activeWorkspace(userId: string, list?: WorkspaceSummary[]): Promise<WorkspaceSummary> {
  const all = list ?? (await listWorkspaces(userId));
  const key = (await cookies()).get(WORKSPACE_COOKIE)?.value;
  return all.find((w) => w.key === key) ?? all[0];
}

/** Throws not_found unless the user may act in this workspace with at least `min`. */
export async function requireWorkspaceRole(userId: string, workspaceId: string, min: WorkspaceRole = "MEMBER"): Promise<WorkspaceSummary> {
  const w = (await listWorkspaces(userId)).find((x) => x.id === workspaceId);
  if (!w || RANK[w.role] < RANK[min]) throw new DomainError("Not found", "not_found");
  return w;
}

/** Remember the active workspace. Ignores keys the user can't use. */
export async function setActiveWorkspace(userId: string, key: string): Promise<WorkspaceSummary | null> {
  const w = (await listWorkspaces(userId)).find((x) => x.key === key);
  if (!w) return null;
  (await cookies()).set(WORKSPACE_COOKIE, w.key, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 24 * 365 });
  return w;
}

export const isCompanyAdmin = (w: WorkspaceSummary) => w.kind === "COMPANY" && RANK[w.role] >= RANK.ADMIN;

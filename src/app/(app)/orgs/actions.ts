"use server";

import { revalidatePath } from "next/cache";
import { requireUserId } from "@/lib/session";
import { toActionError, type ActionResult } from "@/lib/action-result";
import * as org from "@/lib/services/org";

async function run<T>(fn: (userId: string) => Promise<T>, paths: string[]): Promise<ActionResult<T>> {
  try {
    const data = await fn(await requireUserId());
    for (const p of paths) revalidatePath(p, "layout");
    return { ok: true, data };
  } catch (e) {
    return toActionError(e);
  }
}

export const createOrgAction = async (name: string) => run(async (u) => ({ id: (await org.createOrg(u, name)).id }), ["/orgs"]);
export const respondOrgInviteAction = async (memberId: string, accept: boolean) => run((u) => org.respondOrgInvite(u, memberId, accept), ["/orgs"]);
export const respondOrgInviteTokenAction = async (token: string, accept: boolean) => run((u) => org.respondOrgInviteToken(u, token, accept), ["/orgs"]);
export const updateConsentAction = async (orgId: string, consent: unknown) => run((u) => org.updateConsent(u, orgId, consent), [`/orgs/${orgId}`]);
export const leaveOrgAction = async (orgId: string) => run((u) => org.leaveOrg(u, orgId), ["/orgs"]);
export const inviteMembersAction = async (orgId: string, text: string) => run((u) => org.inviteMembers(u, orgId, text), [`/orgs/${orgId}`]);
export const setRoleAction = async (orgId: string, memberId: string, role: "ADMIN" | "MEMBER") => run((u) => org.setRole(u, orgId, memberId, role), [`/orgs/${orgId}`]);
export const removeMemberAction = async (orgId: string, memberId: string) => run((u) => org.removeMember(u, orgId, memberId), [`/orgs/${orgId}`]);
export const setPerformanceAction = async (orgId: string, memberId: string, value: number | null) => run((u) => org.setPerformance(u, orgId, memberId, value), [`/orgs/${orgId}`]);
export const createGroupAction = async (orgId: string, kind: "TEAM" | "COHORT", name: string) => run(async (u) => ({ id: (await org.createGroup(u, orgId, kind, name)).id }), [`/orgs/${orgId}`]);
export const deleteGroupAction = async (orgId: string, groupId: string) => run((u) => org.deleteGroup(u, orgId, groupId), [`/orgs/${orgId}`]);
export const setGroupMembersAction = async (orgId: string, groupId: string, memberIds: string[]) => run((u) => org.setGroupMembers(u, orgId, groupId, memberIds), [`/orgs/${orgId}`]);
export const createCampaignAction = async (orgId: string, input: unknown) => run(async (u) => ({ id: (await org.createCampaign(u, orgId, input)).id }), [`/orgs/${orgId}`]);

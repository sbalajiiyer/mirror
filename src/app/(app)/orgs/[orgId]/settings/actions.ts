"use server";

import { revalidatePath } from "next/cache";
import { requireUserId } from "@/lib/session";
import { toActionError, type ActionResult } from "@/lib/action-result";
import { updateOrgAi, updateOrgData } from "@/lib/services/org-settings";
import { saveSsoConfig, setSsoDomain, verifySsoDomain } from "@/lib/services/sso";

const wrap = async (orgId: string, fn: (uid: string) => Promise<unknown>): Promise<ActionResult> => {
  try {
    await fn(await requireUserId());
    revalidatePath(`/orgs/${orgId}/settings`);
    return { ok: true };
  } catch (e) {
    return toActionError(e);
  }
};

export const updateOrgDataAction = async (orgId: string, input: unknown) => wrap(orgId, (u) => updateOrgData(u, orgId, input));
export const setSsoDomainAction = async (orgId: string, domain: string) => wrap(orgId, (u) => setSsoDomain(u, orgId, domain));
export const verifySsoDomainAction = async (orgId: string) => wrap(orgId, (u) => verifySsoDomain(u, orgId));
export const saveSsoConfigAction = async (orgId: string, input: unknown) => wrap(orgId, (u) => saveSsoConfig(u, orgId, input));
export const updateOrgAiAction = async (orgId: string, input: unknown) => wrap(orgId, (u) => updateOrgAi(u, orgId, input));

import "server-only";
import { notFound } from "next/navigation";
import { DomainError } from "@/lib/errors";
import { requireOnboardedUser } from "@/lib/session";
import { requireAdmin } from "@/lib/services/org";

/** For admin pages: signed-in, onboarded admin of this org, otherwise 404 (no hint that the org exists). */
export async function adminPage(orgId: string, path = "") {
  const user = await requireOnboardedUser(`/orgs/${orgId}${path}`);
  try {
    const admin = await requireAdmin(user.id, orgId);
    return { user, admin };
  } catch (e) {
    if (e instanceof DomainError) notFound();
    throw e;
  }
}

/** Run a service call that may throw a DomainError as a 404. */
export async function or404<T>(p: Promise<T>): Promise<T> {
  try {
    return await p;
  } catch (e) {
    if (e instanceof DomainError) notFound();
    throw e;
  }
}

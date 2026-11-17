import "server-only";
import { notFound } from "next/navigation";
import { DomainError } from "@/lib/errors";
import { requireOnboardedUser } from "@/lib/session";
import { requireRole } from "@/lib/services/org";
import type { CompanyRole } from "@/lib/org/roles";

/** For company pages: signed-in, onboarded member with at least `min`, otherwise 404 (no hint that the org exists). */
export async function adminPage(orgId: string, path = "", min: CompanyRole = "ADMIN") {
  const user = await requireOnboardedUser(`/orgs/${orgId}${path}`);
  try {
    const admin = await requireRole(user.id, orgId, min);
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

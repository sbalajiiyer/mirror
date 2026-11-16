import { ZodError } from "zod";
import { DomainError } from "@/lib/errors";

export type ActionResult<T = undefined> = { ok: true; data?: T } | { ok: false; error: string };

/** Convert thrown validation/domain errors into a user-facing result for server actions. */
export function toActionError(err: unknown): { ok: false; error: string } {
  if (err instanceof ZodError) return { ok: false, error: err.issues[0]?.message ?? "Invalid input" };
  if (err instanceof DomainError) return { ok: false, error: err.message };
  console.error(err);
  return { ok: false, error: "Something went wrong. Please try again." };
}

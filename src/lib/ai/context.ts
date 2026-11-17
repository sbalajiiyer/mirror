import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";
import { db } from "@/lib/db";
import { aiCatalog, resolveModel, type AIModelEntry } from "./models";

/**
 * Phase 11e: which workspace an AI call is made for. Services wrap AI work in `withAiWorkspace`, so
 * `runAI` can apply that company's AI rules (allowed models) and record usage against it, without
 * every AI feature taking another parameter.
 */
type AiScope = { workspaceId: string | null };
const store = new AsyncLocalStorage<AiScope>();

export function withAiWorkspace<T>(workspaceId: string | null | undefined, fn: () => T): T {
  return store.run({ workspaceId: workspaceId ?? null }, fn);
}

export const currentAiWorkspace = () => store.getStore()?.workspaceId ?? null;

/** The workspace an assessment lives in (null if unknown). */
export async function workspaceOfAssessment(assessmentId: string | null | undefined) {
  if (!assessmentId) return null;
  return (await db.assessment.findUnique({ where: { id: assessmentId }, select: { workspaceId: true } }))?.workspaceId ?? null;
}

/**
 * The model to use: the user's choice, unless the current company workspace doesn't allow it, in
 * which case the free model. Personal workspaces allow any available model.
 */
export async function modelForWorkspace(choice: string | null | undefined, workspaceId: string | null = currentAiWorkspace()): Promise<AIModelEntry> {
  const picked = resolveModel(choice);
  if (!workspaceId || picked.tier === "free") return picked;
  const w = await db.workspace.findUnique({ where: { id: workspaceId }, select: { kind: true, org: { select: { allowedAiModels: true } } } });
  if (w?.kind !== "COMPANY") return picked;
  return (w.org?.allowedAiModels ?? []).includes(picked.id) ? picked : aiCatalog()[0];
}

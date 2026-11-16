"use server";

import { revalidatePath } from "next/cache";
import { requireUserId } from "@/lib/session";
import { toActionError, type ActionResult } from "@/lib/action-result";
import * as dash from "@/lib/services/dashboards";
import type { Widget, WidgetData } from "@/lib/dashboards/widgets";

async function run<T>(fn: (u: string) => Promise<T>, path?: string): Promise<ActionResult<T>> {
  try {
    const data = await fn(await requireUserId());
    revalidatePath(path ?? "/dashboards", "layout");
    return { ok: true, data };
  } catch (e) {
    return toActionError(e);
  }
}

export const createDashboardAction = async (input: unknown) => run(async (u) => ({ id: (await dash.createDashboard(u, input)).id }));
export const addWidgetAction = async (id: string, input: unknown) => run(async (u) => (await dash.addWidget(u, id, input)).id);
export const removeWidgetAction = async (id: string, wid: string) => run((u) => dash.removeWidget(u, id, wid));
export const moveWidgetAction = async (id: string, wid: string, dir: -1 | 1) => run((u) => dash.moveWidget(u, id, wid, dir));
export const deleteDashboardAction = async (id: string) => run((u) => dash.deleteDashboard(u, id));
export const setScheduleAction = async (id: string, input: unknown) => run((u) => dash.setSchedule(u, id, input));
export const askDashboardAction = async (id: string, q: string): Promise<ActionResult<{ widget: Widget; data: WidgetData | null; error?: string; explanation: string }>> => {
  try {
    return { ok: true, data: await dash.askDashboard(await requireUserId(), id, q) };
  } catch (e) {
    return toActionError(e);
  }
};

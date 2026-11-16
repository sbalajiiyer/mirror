import { apiRoute } from "@/lib/api/handler";
import { getDashboard, renderWidgets } from "@/lib/services/dashboards";

export const runtime = "nodejs";

/** Every widget's data (same privacy rules as the dashboard page). */
export const GET = apiRoute<{ id: string }>(async (userId, { id }) => {
  const d = await getDashboard(userId, id);
  return { id: d.id, name: d.name, scope: d.scope, widgets: (await renderWidgets(d)).map((r) => ({ id: r.widget.id, type: r.widget.type, config: r.widget.config, ...(r.data ?? { error: r.error }) })) };
});

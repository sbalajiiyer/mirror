import { apiRoute } from "@/lib/api/handler";
import { listDashboards } from "@/lib/services/dashboards";

export const runtime = "nodejs";

export const GET = apiRoute(async (userId) => (await listDashboards(userId)).map((d) => ({ id: d.id, name: d.name, scope: d.scope, updatedAt: d.updatedAt })));

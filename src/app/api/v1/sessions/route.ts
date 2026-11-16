import { apiRoute } from "@/lib/api/handler";
import { groupableSessions } from "@/lib/services/sessions";

export const runtime = "nodejs";

/** Your sessions: survey, number, type, status, date, others' overall average (when visible), company, tags, themes. */
export const GET = apiRoute(async (userId) => (await groupableSessions(userId)).sort((a, b) => b.date.localeCompare(a.date)));

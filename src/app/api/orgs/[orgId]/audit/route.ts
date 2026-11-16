import { auth } from "@/auth";
import { DomainError } from "@/lib/errors";
import { auditCsv, orgAuditLog } from "@/lib/services/activity";
import { audit } from "@/lib/audit";

export async function GET(req: Request, { params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params;
  const uid = (await auth())?.user?.id;
  if (!uid) return new Response("Unauthorized", { status: 401 });
  const sp = Object.fromEntries([...new URL(req.url).searchParams].filter(([k, v]) => ["action", "from", "to"].includes(k) && v));
  try {
    const log = await orgAuditLog(uid, orgId, sp, 5000);
    await audit(uid, "data.export", "Organization", orgId, { what: "audit_log", rows: log.rows.length });
    return new Response(auditCsv(log.rows), { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="audit-log-${new Date().toISOString().slice(0, 10)}.csv"`, "cache-control": "no-store" } });
  } catch (e) {
    if (e instanceof DomainError) return new Response("Not found", { status: 404 });
    throw e;
  }
}

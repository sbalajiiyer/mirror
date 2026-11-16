import { adminPage, or404 } from "@/lib/org/page-guard";
import { db } from "@/lib/db";
import { orgAuditLog } from "@/lib/services/activity";
import { OrgNav } from "@/components/org/org-nav";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const metadata = { title: "Audit log" };

type SP = { action?: string; from?: string; to?: string };
const clean = (sp: SP) => Object.fromEntries(Object.entries(sp).filter(([, v]) => typeof v === "string" && v !== "")) as SP;

export default async function OrgAuditPage({ params, searchParams }: { params: Promise<{ orgId: string }>; searchParams: Promise<SP> }) {
  const { orgId } = await params;
  const sp = clean(await searchParams);
  const { user } = await adminPage(orgId, "/audit");
  const org = await db.organization.findUniqueOrThrow({ where: { id: orgId }, select: { name: true } });
  const log = await or404(orgAuditLog(user.id, orgId, sp));
  const csv = `/api/orgs/${orgId}/audit?${new URLSearchParams(sp as Record<string, string>).toString()}`;
  return (
    <div className="space-y-6">
      <OrgNav orgId={orgId} orgName={org.name} active="audit" />
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Audit log</CardTitle>
          <CardDescription>Who did what in this organization. Raters are anonymous and never appear here.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <form className="grid gap-3 sm:grid-cols-[1fr_auto_auto_auto_auto] sm:items-end">
            <div className="space-y-1.5">
              <Label htmlFor="au-action">Event</Label>
              <select id="au-action" name="action" defaultValue={sp.action ?? ""} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                <option value="">All events</option>
                {log.actions.map((a) => (
                  <option key={a.value} value={a.value}>
                    {a.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="au-from">From</Label>
              <Input id="au-from" name="from" type="date" defaultValue={sp.from ?? ""} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="au-to">To</Label>
              <Input id="au-to" name="to" type="date" defaultValue={sp.to ?? ""} />
            </div>
            <Button type="submit" variant="outline">
              Filter
            </Button>
            <Button asChild variant="outline">
              <a href={csv} download>
                Download CSV
              </a>
            </Button>
          </form>
          {log.rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">No events match.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm" data-testid="audit-table">
                <thead className="text-left text-muted-foreground">
                  <tr>
                    <th className="py-2 pr-3 font-medium">When (UTC)</th>
                    <th className="py-2 pr-3 font-medium">Who</th>
                    <th className="py-2 font-medium">What</th>
                  </tr>
                </thead>
                <tbody>
                  {log.rows.map((r) => (
                    <tr key={r.id} className="border-t">
                      <td className="whitespace-nowrap py-2 pr-3">{r.at.toISOString().slice(0, 16).replace("T", " ")}</td>
                      <td className="py-2 pr-3">{r.actor}</td>
                      <td className="py-2">{r.label}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

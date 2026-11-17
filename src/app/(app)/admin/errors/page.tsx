import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireOnboardedUser } from "@/lib/session";
import { isPlatformAdmin } from "@/lib/monitoring";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { resolveErrorAction } from "./actions";

export const metadata = { title: "Errors", robots: { index: false } };
export const dynamic = "force-dynamic";

const lastDay = () => db.errorEvent.aggregate({ where: { lastSeen: { gte: new Date(Date.now() - 86400000) } }, _sum: { count: true } });

/** Platform admins only (PLATFORM_ADMIN_EMAILS). */
export default async function ErrorsPage({ searchParams }: { searchParams: Promise<{ all?: string }> }) {
  const user = await requireOnboardedUser("/admin/errors");
  if (!isPlatformAdmin(user.email)) notFound();
  const all = !!(await searchParams).all;
  const rows = await db.errorEvent.findMany({ where: all ? {} : { resolvedAt: null }, orderBy: { lastSeen: "desc" }, take: 100 });
  const day = await lastDay();
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Errors</h1>
          <p className="text-muted-foreground">Grouped server, browser and job errors. Messages are scrubbed of emails and tokens.</p>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline">
            <a href="/admin/pricing">Pricing</a>
          </Button>
          <Button asChild variant="outline">
            <a href={all ? "/admin/errors" : "/admin/errors?all=1"}>{all ? "Open only" : "Include resolved"}</a>
          </Button>
        </div>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{rows.length ? `${rows.length} ${all ? "groups" : "open groups"}` : "No open errors"}</CardTitle>
          <CardDescription>{day._sum.count ?? 0} occurrences in the last 24 hours. Health: /api/health (add ?check=pdf to test PDF rendering).</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {rows.map((e) => (
            <details key={e.id} className="rounded-lg border p-3" data-testid="error-row">
              <summary className="flex cursor-pointer flex-wrap items-center gap-2 text-sm">
                <Badge variant={e.kind === "server" ? "warning" : "outline"}>{e.kind}</Badge>
                <span className="font-medium">{e.message}</span>
                <span className="text-muted-foreground">
                  ×{e.count} · {e.route ?? "–"} · last {e.lastSeen.toISOString().slice(0, 16).replace("T", " ")} UTC
                </span>
                {e.resolvedAt && <Badge variant="secondary">resolved</Badge>}
              </summary>
              {e.stack && <pre className="mt-2 overflow-x-auto whitespace-pre-wrap rounded bg-muted p-2 text-xs">{e.stack}</pre>}
              {!e.resolvedAt && (
                <form action={resolveErrorAction.bind(null, e.id)} className="mt-2">
                  <Button type="submit" variant="outline">
                    Mark resolved
                  </Button>
                </form>
              )}
            </details>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

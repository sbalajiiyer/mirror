import Link from "next/link";
import { ArrowLeft, Download } from "lucide-react";
import { requireOnboardedUser } from "@/lib/session";
import { or404 } from "@/lib/org/page-guard";
import { dashboardOptions, getDashboard, renderWidgets } from "@/lib/services/dashboards";
import { widgetLabel, type Scope } from "@/lib/dashboards/widgets";
import { WidgetTable } from "@/components/dashboards/widget-view";
import { AddWidgetForm, AskBox, DeleteDashboardButton, ScheduleForm, WidgetActions } from "@/components/dashboards/dashboard-controls";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata = { title: "Dashboard" };
export const dynamic = "force-dynamic";

export default async function DashboardPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireOnboardedUser(`/dashboards/${id}`);
  const d = await or404(getDashboard(user.id, id));
  const widgets = await renderWidgets(d);
  const opts = await dashboardOptions(d);
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <Link href="/dashboards" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="size-4" aria-hidden /> Dashboards
          </Link>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">{d.name}</h1>
        </div>
        <DeleteDashboardButton dashboardId={d.id} />
      </div>
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Ask your data</CardTitle>
          <CardDescription>Your question is matched to one of Mirror&apos;s views, so answers follow the same privacy rules. Free, 30 questions a day.</CardDescription>
        </CardHeader>
        <CardContent>
          <AskBox dashboardId={d.id} />
        </CardContent>
      </Card>
      <div className="grid gap-4 lg:grid-cols-2" data-testid="widgets">
        {widgets.map((w, i) => (
          <Card key={w.widget.id} data-testid="widget">
            <CardHeader className="pb-2">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <CardTitle className="text-base">{w.data?.title ?? widgetLabel(w.widget.type)}</CardTitle>
                  {w.data?.note && <CardDescription>{w.data.note}</CardDescription>}
                </div>
                <WidgetActions dashboardId={d.id} widgetId={w.widget.id} first={i === 0} last={i === widgets.length - 1} />
              </div>
            </CardHeader>
            <CardContent className="space-y-2">
              {w.data ? <WidgetTable d={w.data} /> : <Alert tone="warning">{w.error}</Alert>}
              {w.data && !w.data.locked && w.data.rows.length > 0 && (
                <Button asChild variant="link" size="sm" className="px-0">
                  <a href={`/api/dashboards/${d.id}/widgets/${w.widget.id}/csv`} download>
                    <Download aria-hidden /> CSV
                  </a>
                </Button>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Customize</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <AddWidgetForm dashboardId={d.id} scope={d.scope as Scope} opts={opts} />
          <ScheduleForm dashboardId={d.id} schedule={d.schedule} day={d.scheduleDay} />
          <p className="text-xs text-muted-foreground">
            Also available through the read-only API: <code>GET /api/v1/dashboards/{d.id}</code> with a token from Settings.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

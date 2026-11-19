import Link from "next/link";
import { notFound } from "next/navigation";
import { requireOnboardedUser } from "@/lib/session";
import { isPlatformAdmin } from "@/lib/monitoring";
import { funnel, rates, shown, SMALL, WINDOWS, type WindowKey } from "@/lib/services/funnel";
import { AdminNav } from "@/components/admin/admin-nav";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export const metadata = { title: "Funnel", robots: { index: false } };
export const dynamic = "force-dynamic";

const LABEL: Record<WindowKey, string> = { "7": "Last 7 days", "30": "Last 30 days", "90": "Last 90 days", all: "All time" };

/** Platform admins only: anonymous totals for each step, from data Mirror already keeps. */
export default async function FunnelPage({ searchParams }: { searchParams: Promise<{ w?: string; test?: string }> }) {
  const user = await requireOnboardedUser("/admin/funnel");
  if (!isPlatformAdmin(user.email)) notFound();
  const sp = await searchParams;
  const w: WindowKey = sp.w && sp.w in WINDOWS ? (sp.w as WindowKey) : "30";
  const includeTest = sp.test === "1";
  const f = await funnel({ window: w, includeTest });
  const href = (next: { w?: WindowKey; test?: boolean }) => `/admin/funnel?w=${next.w ?? w}${(next.test ?? includeTest) ? "&test=1" : ""}`;
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="space-y-3">
        <AdminNav active="Funnel" />
        <h1 className="text-2xl font-semibold tracking-tight">Funnel</h1>
        <p className="text-muted-foreground">
          How many people reach each step. Anonymous totals only: no tracking cookies, page-view events or session recording, and no names. Numbers under {SMALL}{" "}
          show as &ldquo;&lt;{SMALL}&rdquo;.
        </p>
        <div className="flex flex-wrap items-center gap-2 text-sm" role="group" aria-label="Period">
          {(Object.keys(WINDOWS) as WindowKey[]).map((k) => (
            <Link key={k} href={href({ w: k })} aria-current={k === w ? "true" : undefined} className={cn("rounded-full border px-3 py-1", k === w && "border-primary bg-accent font-medium")}>
              {LABEL[k]}
            </Link>
          ))}
          <Link href={href({ test: !includeTest })} className="ml-auto underline" data-testid="toggle-test">
            {includeTest ? "Leave out demo and test accounts" : "Include demo and test accounts"}
          </Link>
        </div>
      </div>
      <FunnelCard title="People asking for feedback" description={`Accounts created ${w === "all" ? "at any time" : `in the ${LABEL[w].toLowerCase()}`}, and how far they got.`} steps={f.steps} testId="subject-funnel" />
      <FunnelCard
        title="Raters"
        description={`Invitations in surveys launched ${w === "all" ? "at any time" : `in the ${LABEL[w].toLowerCase()}`}. Declined: ${shown(f.declined)}.`}
        steps={f.raters}
        testId="rater-funnel"
      />
    </div>
  );
}

function FunnelCard({ title, description, steps, testId }: { title: string; description: string; steps: Parameters<typeof rates>[0]; testId: string }) {
  const rows = rates(steps);
  const max = Math.max(1, ...rows.map((r) => r.count));
  // A percentage of a small number could point back to a person, so it's hidden too.
  const pct = (p: number | null, a: number, b: number) => (p === null || a < SMALL || b < SMALL ? "–" : `${p}%`);
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <table className="w-full text-sm" data-testid={testId}>
          <caption className="sr-only">{title}: people at each step</caption>
          <thead className="text-left text-muted-foreground">
            <tr>
              <th className="py-2 pr-3 font-medium">Step</th>
              <th className="py-2 pr-3 text-right font-medium">People</th>
              <th className="py-2 pr-3 text-right font-medium">From previous</th>
              <th className="py-2 pr-3 text-right font-medium">From start</th>
              <th className="w-1/3 py-2 font-medium">
                <span className="sr-only">Bar</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.key} className="border-t" data-testid={`step-${r.key}`}>
                <td className="py-2 pr-3">
                  {r.label}
                  <span className="block text-xs text-muted-foreground">{r.help}</span>
                </td>
                <td className="py-2 pr-3 text-right tabular-nums">{shown(r.count)}</td>
                <td className="py-2 pr-3 text-right tabular-nums">{i === 0 ? "" : pct(r.fromPrev, r.count, rows[i - 1].count)}</td>
                <td className="py-2 pr-3 text-right tabular-nums">{i === 0 ? "" : pct(r.fromStart, r.count, rows[0].count)}</td>
                <td className="py-2" aria-hidden>
                  <div className="h-2 rounded-full bg-muted">
                    <div className="h-2 rounded-full bg-primary" style={{ width: `${r.count < SMALL ? 0 : (r.count / max) * 100}%` }} />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}

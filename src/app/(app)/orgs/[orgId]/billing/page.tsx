import { adminPage } from "@/lib/org/page-guard";
import { db } from "@/lib/db";
import { platformStatus } from "@/lib/org/platform";
import { formatCents } from "@/lib/billing/catalog";
import { OrgNav } from "@/components/org/org-nav";
import { Product } from "@/components/billing/product-card";
import { BuyCredits } from "@/components/billing/billing-controls";
import { LedgerTable } from "@/components/billing/ledger-table";
import { creditsLabel, discounted, formatCredits } from "@/lib/billing/pricing";
import { getPolicy, orgDiscount } from "@/lib/services/pricing";
import { ledger } from "@/lib/services/credits";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata = { title: "Company billing" };

const day = (d: Date) => d.toISOString().slice(0, 10);

/** The company pays a monthly plan, and rounds and premium AI with company credits. Owners only. */
export default async function OrgBillingPage({ params, searchParams }: { params: Promise<{ orgId: string }>; searchParams: Promise<{ paid?: string }> }) {
  const { orgId } = await params;
  const sp = await searchParams;
  await adminPage(orgId, "/billing", "OWNER");
  const org = await db.organization.findUniqueOrThrow({ where: { id: orgId } });
  const ws = await db.workspace.findUniqueOrThrow({ where: { orgId }, select: { id: true, credits: true } });
  const [policy, surveyOff, aiOff, entries] = await Promise.all([getPolicy(), orgDiscount(orgId, "SURVEYS"), orgDiscount(orgId, "AI"), ledger(ws.id)]);
  const plan = platformStatus(org);
  const payments = await db.payment.findMany({ where: { workspaceId: ws.id }, orderBy: { createdAt: "desc" }, take: 20 });
  const paid = sp.paid ? payments.find((p) => p.id === sp.paid && p.status === "PAID") : null;
  return (
    <div className="space-y-6">
      <OrgNav orgId={orgId} orgName={org.name} active="billing" />
      {paid && <Alert tone="success">Payment received. Thank you.</Alert>}

      <Card data-testid="company-plan">
        <CardHeader>
          <CardTitle className="flex flex-wrap items-center gap-2 text-base">
            Company plan
            {plan.active ? <Badge variant={plan.trial ? "outline" : "default"}>{plan.trial ? "Free trial" : "Active"}</Badge> : <Badge variant="destructive">Ended</Badge>}
          </CardTitle>
          <CardDescription data-testid="company-plan-status">
            {plan.active
              ? `${plan.trial ? "Free trial" : "Paid"} until ${day(plan.until)}.`
              : `Ended on ${day(plan.until)}. Results stay available; renew to start new rounds.`}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          <Product k="company_platform_month" context={{ orgId }} label={plan.active ? "Add a month" : "Renew"} />
        </CardContent>
      </Card>

      <Card data-testid="org-billing">
        <CardHeader>
          <CardTitle className="flex flex-wrap items-center gap-2 text-base">
            Company credits
            <span className="text-2xl font-semibold tabular-nums" data-testid="org-credits">
              {formatCredits(ws.credits)}
            </span>
          </CardTitle>
          <CardDescription>
            A 360 round costs {creditsLabel(discounted(policy.companyParticipant, surveyOff))} per person{surveyOff ? ` (${surveyOff}% company discount)` : ""}. Pulse checks
            and follow-up sessions in this workspace are paid from these credits too. Premium AI costs its actual price × {policy.premiumMarkupPct / 100}
            {aiOff ? `, less ${aiOff}%` : ""}, within the AI budget in Settings.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <BuyCredits fees={policy} min={policy.minTopUp} max={policy.maxTopUp} orgId={orgId} suggested={[100, 250, 500, 1000]} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Credit history</CardTitle>
        </CardHeader>
        <CardContent>
          <LedgerTable rows={entries} testId="org-credit-ledger" />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Company payments</CardTitle>
        </CardHeader>
        <CardContent>
          {payments.length === 0 ? (
            <p className="text-sm text-muted-foreground">No payments yet.</p>
          ) : (
            <ul className="divide-y text-sm">
              {payments.map((p) => (
                <li key={p.id} className="flex justify-between gap-2 py-2">
                  <span>
                    {day(p.createdAt)} ·{" "}
                    {p.product === "credits"
                      ? `${((p.context as { credits?: number }).credits ?? 0).toLocaleString("en-US")} credits`
                      : p.product === "company_platform_month"
                        ? "Company plan (1 month)"
                        : p.product}
                  </span>
                  <span className="tabular-nums">
                    {formatCents(p.amountCents, p.currency)} · {p.status.toLowerCase()}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

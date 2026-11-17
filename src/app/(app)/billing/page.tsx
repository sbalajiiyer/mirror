import Link from "next/link";
import { db } from "@/lib/db";
import { requireOnboardedUser } from "@/lib/session";
import { billingOverview } from "@/lib/services/billing";
import { paymentProvider } from "@/lib/billing/provider";
import { COACH_CLIENT_LIMIT, PLANS, PRODUCTS, formatCents, type ProductKey } from "@/lib/billing/catalog";
import { CancelSubscriptionButton } from "@/components/billing/billing-controls";
import { Product } from "@/components/billing/product-card";
import { redirect } from "next/navigation";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata = { title: "Billing" };

const date = (d: Date) => d.toISOString().slice(0, 10);


export default async function BillingPage({ searchParams }: { searchParams: Promise<{ paid?: string; canceled?: string; unlock?: string }> }) {
  const user = await requireOnboardedUser("/billing");
  const sp = await searchParams;
  const o = await billingOverview(user.id);
  const unlock = sp.unlock ? await db.assessment.findFirst({ where: { id: sp.unlock, subjectId: user.id }, select: { id: true, title: true, unlockedAt: true } }) : null;
  const paid = sp.paid ? o.payments.find((p) => p.id === sp.paid) : null;
  // Company purchases (Phase 11e) are shown on the company's own billing page.
  const paidOrg = (paid?.context as { orgId?: string } | null)?.orgId;
  if (paidOrg) redirect(`/orgs/${paidOrg}/billing?paid=${paid!.id}`);
  const stub = paymentProvider().name === "stub";
  const personalSub = o.subscriptions.find((s) => s.plan === "PRO");
  const coachSub = o.subscriptions.find((s) => s.plan.startsWith("COACH_"));

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Billing</h1>
        <p className="text-muted-foreground">Your plan, credits and purchases.</p>
      </div>
      {stub && (
        <Alert tone="warning" data-testid="test-mode">
          Test mode: payments are simulated and no card is charged. Real payments switch on when the owner connects a payment provider.
        </Alert>
      )}
      {paid && paid.status === "PAID" && <Alert tone="success">Thanks! {PRODUCTS[paid.product as ProductKey]?.label ?? paid.product} is now on your account.</Alert>}
      {sp.canceled && <Alert tone="info">Checkout canceled. Nothing was charged.</Alert>}

      {unlock && !unlock.unlockedAt && (
        <Card data-testid="unlock-prompt">
          <CardHeader>
            <CardTitle className="text-base">Unlock “{unlock.title}”</CardTitle>
            <CardDescription>A full 360 adds unlimited raters and PDF export for this survey. Pro covers every 360 for a year.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            <Product k="full_360" context={{ assessmentId: unlock.id }} label="Unlock this 360" />
            <Product k="pro_yearly" label="Go Pro" />
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            Your plan <Badge data-testid="plan-badge">{PLANS[o.plan].label}</Badge>
          </CardTitle>
          <CardDescription>{PLANS[o.plan].features.join(" · ")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {personalSub && (
            <div className="flex flex-wrap items-center gap-3 text-sm">
              <span>
                {personalSub.status === "ACTIVE" ? "Renews" : "Ends"} {date(personalSub.currentPeriodEnd)}
              </span>
              {personalSub.status === "ACTIVE" && <CancelSubscriptionButton id={personalSub.id} />}
            </div>
          )}
          <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
            <div className="rounded-lg border p-3">
              <dt className="text-muted-foreground">AI credits</dt>
              <dd className="text-xl font-semibold" data-testid="ai-credits">{o.credits}</dd>
            </div>
            <div className="rounded-lg border p-3">
              <dt className="text-muted-foreground">Full-360 unlocks</dt>
              <dd className="text-xl font-semibold" data-testid="full360-unlocks">{o.full360Unlocks}</dd>
            </div>
            {o.coachPlan && (
              <div className="rounded-lg border p-3">
                <dt className="text-muted-foreground">Client report credits</dt>
                <dd className="text-xl font-semibold" data-testid="report-credits">{o.reportCredits}</dd>
              </div>
            )}
          </dl>
          <p className="text-xs text-muted-foreground">An unused full-360 unlock is applied automatically when you invite more than 5 raters to a 360.</p>
          <div className="grid gap-3 sm:grid-cols-3">
            {o.plan === "FREE" && <Product k="pro_yearly" />}
            <Product k="full_360" />
            <Product k="ai_credits_5" />
          </div>
        </CardContent>
      </Card>

      {o.coachPlan && (
        <Card data-testid="coach-billing">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              Coaching practice <Badge>{PLANS[o.coachPlan].label}</Badge>
            </CardTitle>
            <CardDescription>
              {o.activeClients} of {COACH_CLIENT_LIMIT[o.coachPlan]} active clients · {PLANS[o.coachPlan].features.join(" · ")}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {coachSub && (
              <div className="flex flex-wrap items-center gap-3 text-sm">
                <span>
                  {coachSub.status === "ACTIVE" ? "Renews" : "Ends"} {date(coachSub.currentPeriodEnd)}
                </span>
                {coachSub.status === "ACTIVE" && <CancelSubscriptionButton id={coachSub.id} />}
              </div>
            )}
            <div className="grid gap-3 sm:grid-cols-3">
              {o.coachPlan !== "COACH_PRO" && <Product k="coach_starter_month" label={o.coachPlan === "COACH_STARTER" ? "Add a month" : undefined} />}
              <Product k="coach_pro_month" label={o.coachPlan === "COACH_PRO" ? "Add a month" : undefined} />
              <Product k="coach_report_credits_5" />
            </div>
            <p className="text-sm">
              <Link href="/coach/settings" className="underline">
                Marketplace listing and referral fees
              </Link>
            </p>
          </CardContent>
        </Card>
      )}

      {o.orgs.map((org) => (
        <Card key={org.id} data-testid="org-billing">
          <CardHeader>
            <CardTitle className="text-base">{org.name}</CardTitle>
            <CardDescription>Company plan and participant seats are managed in the company workspace.</CardDescription>
          </CardHeader>
          <CardContent>
            <Link href={`/orgs/${org.id}/billing`} className="text-sm font-medium underline">
              Open {org.name} billing
            </Link>
          </CardContent>
        </Card>
      ))}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Payment history</CardTitle>
        </CardHeader>
        <CardContent>
          {o.payments.length === 0 ? (
            <p className="text-sm text-muted-foreground">No payments yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm" data-testid="payments">
                <thead className="text-left text-muted-foreground">
                  <tr>
                    <th className="py-2 pr-3 font-medium">Date</th>
                    <th className="py-2 pr-3 font-medium">Item</th>
                    <th className="py-2 pr-3 font-medium">Amount</th>
                    <th className="py-2 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {o.payments.map((p) => (
                    <tr key={p.id} className="border-t">
                      <td className="py-2 pr-3">{date(p.createdAt)}</td>
                      <td className="py-2 pr-3">{PRODUCTS[p.product as ProductKey]?.label ?? p.product}</td>
                      <td className="py-2 pr-3">{formatCents(p.amountCents, p.currency)}</td>
                      <td className="py-2">
                        {p.status === "PENDING" && p.provider === "stub" ? (
                          <Link className="underline" href={`/billing/checkout/${p.id}`}>
                            Pending: finish checkout
                          </Link>
                        ) : (
                          p.status.toLowerCase()
                        )}
                        {p.provider === "stub" && p.status !== "PENDING" && <span className="text-muted-foreground"> (test)</span>}
                      </td>
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

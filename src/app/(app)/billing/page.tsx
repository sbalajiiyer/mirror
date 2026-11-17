import Link from "next/link";
import { requireOnboardedUser } from "@/lib/session";
import { isPlatformAdmin } from "@/lib/monitoring";
import { billingOverview, coachGiftPrice, personalPrices } from "@/lib/services/billing";
import { paymentProvider } from "@/lib/billing/provider";
import { COACH_CLIENT_LIMIT, PLANS, PRODUCTS, formatCents, type ProductKey } from "@/lib/billing/catalog";
import { creditsLabel, formatCredits } from "@/lib/billing/pricing";
import { BuyCredits, CancelSubscriptionButton } from "@/components/billing/billing-controls";
import { LedgerTable } from "@/components/billing/ledger-table";
import { Product } from "@/components/billing/product-card";
import { redirect } from "next/navigation";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata = { title: "Billing" };

const date = (d: Date) => d.toISOString().slice(0, 10);

/** Credits: balance, top-ups (buyer pays fees), what things cost this person, history. */
export default async function BillingPage({ searchParams }: { searchParams: Promise<{ paid?: string; canceled?: string; need?: string }> }) {
  const user = await requireOnboardedUser("/billing");
  const sp = await searchParams;
  const [o, prices] = await Promise.all([billingOverview(user.id), personalPrices(user.id)]);
  const paid = sp.paid ? o.payments.find((p) => p.id === sp.paid) : null;
  // Company purchases (Phase 11e) are shown on the company's own billing page.
  const paidOrg = (paid?.context as { orgId?: string } | null)?.orgId;
  if (paidOrg) redirect(`/orgs/${paidOrg}/billing?paid=${paid!.id}`);
  const paidCredits = (paid?.context as { credits?: number } | null)?.credits;
  const stub = paymentProvider().name === "stub";
  const personalSub = o.subscriptions.find((s) => s.plan === "PRO");
  const coachSub = o.subscriptions.find((s) => s.plan.startsWith("COACH_"));
  const gift = o.coachPlan ? await coachGiftPrice(user.id) : null;
  const need = sp.need && /^\d+$/.test(sp.need) ? Number(sp.need) : null;
  const short = need != null && need > o.balance ? Math.ceil((need - o.balance) / 100) : null;
  const { policy } = prices;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Billing</h1>
        <p className="text-muted-foreground">
          Your credits, what things cost, and your purchases. $1 = 1 credit.
          {isPlatformAdmin(user.email) && (
            <>
              {" "}
              <Link href="/admin/pricing" className="underline">
                Edit pricing
              </Link>
            </>
          )}
        </p>
      </div>
      {stub && (
        <Alert tone="warning" data-testid="test-mode">
          Test mode: payments are simulated and no card is charged. Real payments switch on when the owner connects a payment provider.
        </Alert>
      )}
      {paid && paid.status === "PAID" && (
        <Alert tone="success">
          Thanks! {paidCredits ? `${paidCredits.toLocaleString("en-US")} credits were added.` : `${PRODUCTS[paid.product as ProductKey]?.label ?? paid.product} is now on your account.`}
        </Alert>
      )}
      {sp.canceled && <Alert tone="info">Checkout canceled. Nothing was charged.</Alert>}
      {short != null && (
        <Alert tone="info" data-testid="need-credits">
          You need {creditsLabel(need!)} and have {formatCredits(o.balance)}. Add at least {short} credit{short === 1 ? "" : "s"} to continue.
        </Alert>
      )}

      <Card data-testid="credits-card">
        <CardHeader>
          <CardTitle className="flex flex-wrap items-center gap-2 text-base">
            Credits
            <span className="text-2xl font-semibold tabular-nums" data-testid="credit-balance">
              {formatCredits(o.balance)}
            </span>
          </CardTitle>
          <CardDescription>Buy any number of credits. Card and processing fees are added at checkout and shown before you pay.</CardDescription>
        </CardHeader>
        <CardContent>
          <BuyCredits fees={policy} min={policy.minTopUp} max={policy.maxTopUp} suggested={short ? [short, 50, 100, 250] : undefined} />
        </CardContent>
      </Card>

      <Card data-testid="price-list">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            What things cost {o.plan === "PRO" && <Badge>{PLANS.PRO.label}</Badge>}
          </CardTitle>
          <CardDescription data-testid="free-survey">
            {prices.freeLeft > 0
              ? `Your first ${prices.freeLeft === 1 ? "360 is" : `${prices.freeLeft} 360s are`} free, with everything except premium AI models.`
              : "You've used your free 360."}{" "}
            Every survey includes unlimited raters and PDF export. Credits are taken when you send the invitations.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
            <div className="rounded-lg border p-3">
              <dt className="text-muted-foreground">360 survey</dt>
              <dd className="text-xl font-semibold" data-testid="price-survey">
                {creditsLabel(prices.survey360)}
              </dd>
            </div>
            <div className="rounded-lg border p-3">
              <dt className="text-muted-foreground">Follow-up session</dt>
              <dd className="text-xl font-semibold">{creditsLabel(prices.followUp)}</dd>
            </div>
            <div className="rounded-lg border p-3">
              <dt className="text-muted-foreground">Pulse check</dt>
              <dd className="text-xl font-semibold">{creditsLabel(prices.pulse)}</dd>
            </div>
            <div className="rounded-lg border p-3">
              <dt className="text-muted-foreground">Premium AI</dt>
              <dd className="text-sm font-semibold">Cost × {policy.premiumMarkupPct / 100}, per use</dd>
            </div>
          </dl>
          {(prices.surveyDiscount > 0 || prices.aiDiscount > 0) && (
            <p className="text-sm" data-testid="your-discount">
              Your discount: {[prices.surveyDiscount && `${prices.surveyDiscount}% off surveys`, prices.aiDiscount && `${prices.aiDiscount}% off premium AI`].filter(Boolean).join(", ")}. The prices above include it.
            </p>
          )}
          {o.giftedSurveys > 0 && (
            <p className="text-sm">
              Gifted by your coach: {o.giftedSurveys} paid-for 360{o.giftedSurveys === 1 ? "" : "s"}, used automatically.
            </p>
          )}
          <p className="text-xs text-muted-foreground">
            The free AI model is always free. Premium models are charged at their actual cost × {policy.premiumMarkupPct / 100}, usually a few hundredths of a credit per request.
          </p>
          {personalSub && (
            <div className="flex flex-wrap items-center gap-3 text-sm">
              <span>Your earlier Pro plan covers surveys until {date(personalSub.currentPeriodEnd)}.</span>
              {personalSub.status === "ACTIVE" && <CancelSubscriptionButton id={personalSub.id} />}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Credit history</CardTitle>
        </CardHeader>
        <CardContent>
          <LedgerTable rows={o.ledger} />
        </CardContent>
      </Card>

      {o.coachPlan && (
        <Card data-testid="coach-billing">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              Coaching practice <Badge>{PLANS[o.coachPlan].label}</Badge>
            </CardTitle>
            <CardDescription>
              {o.activeClients} of {COACH_CLIENT_LIMIT[o.coachPlan]} active clients · {PLANS[o.coachPlan].features.join(" · ")}. Gifting a 360 to a client costs{" "}
              {creditsLabel(gift!.price)} from your credits.
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
            <CardDescription>
              Company credits: <span className="tabular-nums">{formatCredits(org.credits)}</span>. The company plan and company credits are managed in the company workspace.
            </CardDescription>
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
                      <td className="py-2 pr-3">
                        {p.product === "credits" ? `${((p.context as { credits?: number }).credits ?? 0).toLocaleString("en-US")} credits` : (PRODUCTS[p.product as ProductKey]?.label ?? p.product)}
                      </td>
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

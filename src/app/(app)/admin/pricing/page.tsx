import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireOnboardedUser } from "@/lib/session";
import { isPlatformAdmin } from "@/lib/monitoring";
import { getPolicy, listDiscounts } from "@/lib/services/pricing";
import { SCOPE_LABEL, type DiscountScope } from "@/lib/billing/pricing";
import {
  DiscountForm,
  PolicyForm,
  RevokeDiscount,
} from "@/components/admin/pricing-forms";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const metadata = { title: "Pricing", robots: { index: false } };
export const dynamic = "force-dynamic";

const day = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : "");

/** Platform admins only (PLATFORM_ADMIN_EMAILS): the pricing policy and discounts. */
export default async function PricingAdminPage() {
  const user = await requireOnboardedUser("/admin/pricing");
  if (!isPlatformAdmin(user.email)) notFound();
  const [policy, discounts, orgs, history] = await Promise.all([
    getPolicy(),
    listDiscounts(),
    db.organization.findMany({
      select: { id: true, name: true },
      orderBy: { name: "asc" },
      take: 500,
    }),
    db.auditLog.findMany({
      where: { action: { startsWith: "pricing." } },
      orderBy: { createdAt: "desc" },
      take: 15,
      include: { actor: { select: { email: true } } },
    }),
  ]);
  const { updatedAt, ...values } = policy;
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Pricing</h1>
          <p className="text-muted-foreground">
            What everything costs in credits ($1 = 1 credit). Changes apply to
            new charges right away; nothing already paid changes.
            {updatedAt && ` Last changed ${day(updatedAt)}.`}
          </p>
        </div>
        <Link href="/admin/errors" className="text-sm underline">
          Errors
        </Link>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Pricing policy</CardTitle>
          <CardDescription>
            Prices in credits (two decimals allowed). Fees are added to top-ups
            and paid by the buyer.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <PolicyForm initial={values} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Discounts</CardTitle>
          <CardDescription>
            A percentage off for a company (its rounds, sessions and premium AI)
            or for a person (their own surveys, coach gifts and premium AI). If
            several apply, the largest wins; they don&apos;t add up.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <DiscountForm orgs={orgs} />
          {discounts.length === 0 ? (
            <p className="text-sm text-muted-foreground">No discounts.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm" data-testid="discounts">
                <thead className="text-left text-muted-foreground">
                  <tr>
                    <th className="py-2 pr-3 font-medium">Who</th>
                    <th className="py-2 pr-3 font-medium">Off</th>
                    <th className="py-2 pr-3 font-medium">On</th>
                    <th className="py-2 pr-3 font-medium">Dates</th>
                    <th className="py-2 font-medium">
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {discounts.map((d) => (
                    <tr key={d.id} className="border-t">
                      <td className="py-2 pr-3">
                        {d.label}{" "}
                        <span className="text-muted-foreground">
                          ({d.orgId ? "company" : "person"})
                        </span>
                        {d.note && (
                          <div className="text-xs text-muted-foreground">
                            {d.note}
                          </div>
                        )}
                      </td>
                      <td className="py-2 pr-3 tabular-nums">{d.percent}%</td>
                      <td className="py-2 pr-3">
                        {SCOPE_LABEL[d.scope as DiscountScope] ?? d.scope}
                      </td>
                      <td className="py-2 pr-3">
                        {d.startsAt || d.endsAt
                          ? `${day(d.startsAt) || "now"} – ${day(d.endsAt) || "no end"}`
                          : "Always"}
                      </td>
                      <td className="py-2 text-right">
                        <RevokeDiscount id={d.id} label={d.label} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent changes</CardTitle>
        </CardHeader>
        <CardContent>
          {history.length === 0 ? (
            <p className="text-sm text-muted-foreground">No changes yet.</p>
          ) : (
            <ul className="divide-y text-sm" data-testid="pricing-history">
              {history.map((h) => (
                <li key={h.id} className="py-2">
                  <span className="text-muted-foreground">
                    {h.createdAt.toISOString().slice(0, 16).replace("T", " ")}
                  </span>{" "}
                  · {h.actor?.email ?? "system"} ·{" "}
                  {h.action.replace("pricing.", "").replace("_", " ")}
                  {h.action === "pricing.update" &&
                    h.meta &&
                    typeof h.meta === "object" && (
                      <span className="text-muted-foreground">
                        {" "}
                        (
                        {Object.entries(
                          h.meta as Record<
                            string,
                            { from: number; to: number }
                          >,
                        )
                          .map(([k, v]) => `${k} ${v.from} → ${v.to}`)
                          .join(", ") || "no change"}
                        )
                      </span>
                    )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

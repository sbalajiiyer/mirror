import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireUserId } from "@/lib/session";
import { PRODUCTS, formatCents, purchaseTerms, type ProductKey } from "@/lib/billing/catalog";
import { StubCheckout } from "@/components/billing/billing-controls";
import { Alert } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata = { title: "Test checkout" };

/** Stand-in for a hosted payment page while no payment provider is connected. */
export default async function StubCheckoutPage({ params }: { params: Promise<{ paymentId: string }> }) {
  const { paymentId } = await params;
  const userId = await requireUserId(`/billing/checkout/${paymentId}`);
  const p = await db.payment.findFirst({ where: { id: paymentId, userId, provider: "stub" } });
  if (!p) notFound();
  if (p.status !== "PENDING") redirect("/billing");
  const product = PRODUCTS[p.product as ProductKey];
  return (
    <div className="mx-auto max-w-md space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight">Test checkout</h1>
      <Alert tone="warning">This is a simulated payment page. No card is needed and nothing is charged.</Alert>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{product?.label ?? p.product}</CardTitle>
          <CardDescription>{product?.description}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-3xl font-semibold" data-testid="checkout-amount">{formatCents(p.amountCents, p.currency)}</p>
          <p className="text-sm text-muted-foreground" data-testid="checkout-terms">
            {product ? purchaseTerms(p.product as ProductKey) : "One-time payment."}
          </p>
          <StubCheckout paymentId={p.id} />
        </CardContent>
      </Card>
    </div>
  );
}

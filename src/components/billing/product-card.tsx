import { PRODUCTS, formatCents, type ProductKey } from "@/lib/billing/catalog";
import { BuyButton } from "@/components/billing/billing-controls";

/** One product with its price and a buy button. */
export function Product({ k, context, label }: { k: ProductKey; context?: { assessmentId?: string; orgId?: string }; label?: string }) {
  const p = PRODUCTS[k];
  return (
    <div className="flex flex-col justify-between gap-3 rounded-lg border p-4" data-testid={`product-${k}`}>
      <div>
        <p className="font-medium">{p.label}</p>
        <p className="text-2xl font-semibold">{formatCents(p.amountCents)}</p>
        <p className="mt-1 text-sm text-muted-foreground">{p.description}</p>
      </div>
      <BuyButton product={k} context={context} label={label ?? `Buy ${p.label}`} />
    </div>
  );
}

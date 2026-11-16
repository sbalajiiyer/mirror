import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { verifyStripeSignature } from "@/lib/billing/provider";
import { markPaid } from "@/lib/services/billing";

/** Stripe webhook: only active when STRIPE_WEBHOOK_SECRET is set. Fulfilment is idempotent per payment. */
export async function POST(req: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) return NextResponse.json({ error: "not_configured" }, { status: 404 });
  const body = await req.text();
  if (!verifyStripeSignature(body, req.headers.get("stripe-signature"), secret)) return NextResponse.json({ error: "bad_signature" }, { status: 400 });
  const event = JSON.parse(body) as { type: string; data: { object: { id: string; client_reference_id?: string; payment_status?: string } } };
  const s = event.data.object;
  if (event.type === "checkout.session.completed" && s.client_reference_id && s.payment_status === "paid") {
    const p = await db.payment.findUnique({ where: { id: s.client_reference_id } });
    if (p && p.provider === "stripe") await markPaid(p.id, s.id);
  }
  if (event.type === "checkout.session.expired" && s.client_reference_id) {
    await db.payment.updateMany({ where: { id: s.client_reference_id, status: "PENDING", provider: "stripe" }, data: { status: "CANCELED" } });
  }
  return NextResponse.json({ received: true });
}

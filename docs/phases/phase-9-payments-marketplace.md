# Phase 9 — Payments and marketplace: demo script

**Owner decision (2026-11-16):** build everything with payments **simulated**. Plans, credit packs and the
marketplace work end to end through an in-app **Test checkout** (no card, nothing charged). Real Stripe Checkout is
already written behind the same interface and switches on with environment variables (see below).

**Built:**
- **Plans and limits** (enforced on the server; `BILLING_ENFORCED=false` turns them all off):

  | Plan | Price | What it gives |
  |---|---|---|
  | Free | – | Up to 5 raters per 360 (group links included), interactive report, 1 pulse per survey, AI coach 30 messages/day |
  | Full 360 (one-off) | $49 | Unlimited raters + PDF for one 360 (bought for a specific 360, or kept as a prepaid unlock that applies automatically) |
  | Pro (yearly) | $99 | Unlimited raters, PDF, unlimited pulses, AI coach 100 messages/day, +3 AI credits |
  | 5 AI credits | $19.99 | AI questionnaires or premium AI conversations |
  | Coach Free / Starter / Pro | $0 / $29 / $79 a month | 3 / 10 / 40 active clients (pending invitations count); white-label branding and marketplace listing on paid plans |
  | 5 client report credits | $175 | A coach gifts a full 360 to a client ($35 each, wholesale) |
  | Org seats | $299 for 25, $1,000 for 100 | One seat per participant per 360 round; new organizations start with 10 |

  - Existing 360s are grandfathered: the migration marks every 360 created before Phase 9 as unlocked.
  - Org-round 360s are always unlocked (the org paid for the seat).
  - Subscriptions extend on repeat purchase; canceling stops renewal and keeps access to the end of the period.
- **Billing page** (`/billing`): plan, credits, prepaid unlocks, coach plan and client usage, org seats, buy
  buttons, payment history, and an unlock prompt (`/billing?unlock=<360 id>`) linked from the locked PDF button.
- **Checkout:** `startCheckout` creates a `Payment`, then asks the provider for a checkout URL. Fulfilment is
  idempotent per payment, so a webhook retry or double click never delivers twice.
  - Stub provider (default): `/billing/checkout/<id>` with **Pay (test)** / **Cancel**.
  - Stripe provider: Stripe Checkout via REST, confirmed by a signed webhook at `/api/billing/webhook`.
- **Coach marketplace** (`/coaches`): verified coaches on a paid plan, searchable by text, specialty and
  language (Coach Pro first).
  - Coaches edit their listing (headline, bio, specialties, languages, session price) in **Coach → Profile & branding**.
  - Platform verification: `npm run coach:verify -- <email>` (`--revoke` to remove).
  - **Request an intro** sends an ordinary client→coach invitation; nothing is shared until the coach accepts
    and the client chooses what to share.
  - When the coach accepts, a referral fee is recorded: 10% of one session, minimum $15. It is shown to the
    coach and invoiced separately; no automatic charge.
- **Gift a full 360:** button on a coach's client page; it uses one report credit.

## Try it (after `npx prisma db seed`)

Sign in with the demo buttons:
1. **Alex (Pro):** open **Billing**. The banner says Test mode. Buy **5 AI credits** → **Pay (test)**, and the
   credits go up. Open **Coaching → Find a verified coach** and filter "first-time". Open **Priya Shah** →
   **Request an intro**.
2. **Jordan (Coach Starter, listed):** open **Coach → Profile & branding**. You see the plan (clients used), the
   marketplace listing and any referrals. Open a client and click **Gift a full 360** (3 credits seeded).
3. **Morgan (org admin):** **Billing** shows Brightline's 100 seats; buy 25 more. **360 rounds** shows seats left.
4. **A free user:** sign in as a new address. Add 6 raters to a 360 and you're asked to unlock. Close a 360 and
   the PDF button links to the unlock offer.

## Switching on real payments (Stripe)

1. Create a Stripe account (owner decision; card processing fees apply per payment).
2. Set `PAYMENTS_PROVIDER=stripe`, `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` on Vercel.
3. Add a webhook endpoint `https://<domain>/api/billing/webhook` for the events `checkout.session.completed`
   and `checkout.session.expired`.

Prices live in `src/lib/billing/catalog.ts` and are sent inline, so no Stripe products need to be created.
Subscriptions are bought as fixed periods (one-off payments that extend the plan), not auto-renewing Stripe
subscriptions. Auto-renewal can be added later.

## Tests
- Unit (`tests/unit/billing.test.ts`): catalog, referral fee, Stripe signature verification.
- Integration (`tests/integration/billing.test.ts`), with enforcement on:
  - rater cap and unlocks (per-360 and prepaid)
  - canceled checkouts
  - Pro extension and cancelation, pulse limit, chat tier
  - coach client caps, branding, report credits and gifting
  - org seats
  - marketplace listing rules, verification, filters and referral fees
- End to end (`tests/e2e/phase9.spec.ts`):
  - buy credits through the test checkout
  - marketplace search and intro
  - coach plan, listing and gift
  - org seats purchase
  - accessibility checks on Billing and Find a coach

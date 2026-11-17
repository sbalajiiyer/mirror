# Credits (November 2026)

Owner decisions (2026-11-17):

- Everyone pays with **credits**. **$1 = 1 credit.** People buy any whole number of credits. There are no packs.
- The buyer pays the card fee and any other processing costs on top.
- **One free survey** per person: their first 360. It includes everything except premium AI models.
- After that, every survey costs credits:
  - a flat price per 360
  - a lower price for pulse checks
- **Premium AI** (Claude or GPT) costs its **actual provider cost × 2**. The free model stays free.
- **Pricing is not hard-coded.** It lives in the database and platform admins edit it. Discounts can be set per company and per person.
- Coaches and companies use credits too. Coach plans and the company plan stay monthly subscriptions.

## How it works

| Thing | Where |
|---|---|
| Prices, fees, free-survey count, welcome credits, top-up limits | `PricingPolicy` (one row), edited at **/admin/pricing** |
| Discounts (% off, ALL / SURVEYS / AI, optional dates) | `PriceDiscount`, per company (`orgId`) or person (`userId`); the best active one wins, they don't stack |
| Wallets | `Workspace.credits`: personal workspace = the person, company workspace = the company |
| History | `CreditLedger` (amount, reason, balance after) |
| Arithmetic (pure, shared by pages and server) | `src/lib/billing/pricing.ts` |
| Policy and discounts | `src/lib/services/pricing.ts` |
| Wallet operations | `src/lib/services/credits.ts` (`addCredits`, `spendCredits` all-or-nothing, `spendUpTo` for AI) |
| Charging | `src/lib/services/billing.ts` (`launchQuote`, `chargeForLaunch`, `roundQuote`, `chargeRound`, `giftFull360`, checkout) |
| Premium AI | `src/lib/ai/context.ts` (`premiumPayer`, `chargePremiumAI`); `runAI` / `runAIStream` charge after a successful premium request |

### Storage

Amounts are integers in **hundredths of a credit**: 4900 = 49 credits, 3 = 0.03. A cent and a hundredth of a credit are the same amount, so the company AI budgets (`aiBudgetCents`, `aiPerPersonCents`) now cap credits charged.

### When credits are taken

1. **Personal sessions** are charged once, when the invites first go out (`launchAssessment`). A draft costs nothing. The checks run in this order:
   1. company round: prepaid, nothing to charge
   2. free 360: only a person's first new survey, up to `freeSurveys`
   3. an earlier Pro plan that is still active: free until it ends
   4. a coach's gift
   5. credits
2. The price depends on the kind of session:
   - a new 360 costs `survey360`
   - a re-run costs `followUp`
   - a pulse costs `pulse`
   - in a company workspace, 360s and re-runs cost `companyParticipant` and pulses cost `pulse`, all paid from company credits
3. **Company rounds:** the participant price for each person, paid from company credits when the round starts. This happens in the same transaction as creating the round, so a failed charge leaves nothing behind.
4. **Coach gifts:** the coach pays `coachGift` from their own credits, and the client gets one paid 360 (an `Entitlement` of kind `full_360`). The client's free survey is used first; the gift pays for the next one.
5. **Premium AI:**
   - Model choice falls back to the free model when the paying wallet is empty. In a company workspace it also falls back when the model isn't allowed or the budget is used up.
   - After a successful premium request: `ceil(costMicros × markup ÷ 10,000)`, minus any discount, with a minimum of 0.01. It is taken from the wallet and never takes the balance below zero.
   - The amount is stored in `AIInteractionLog.charged`.

### Top-ups

`total = ceil((credits × 100 + fixed fees) ÷ (1 − percentage fees))`, so after the provider takes its fee the credits are covered. The billing page shows the breakdown before checkout, for example "37 credits $37.00 + card and processing fees $1.42 = $38.42". Company owners buy company credits on the company billing page.

### What was removed

- The 5-rater cap
- PDF and pulse limits
- "Unlock this 360"
- Pro, AI credit packs, report-credit packs and seat packs: no longer sold. They are marked `retired` so old payments keep their names.
- The 1-credit charge for an AI questionnaire or a premium conversation

### Migration (`20261119090000_credits`)

It only adds things:

- **Policy:** creates the policy row with the starting values.
- **Existing balances** convert to credits at what they were worth:
  - old AI credit: 4 credits
  - unused purchased 360 unlock: 49 credits
  - coach report credit: 35 credits
  - company seat: 12 credits
- **Coach gifts:** gifted 360s stay as gifts.
- **Already-launched sessions** are marked `GRANDFATHERED`. Existing users therefore still get one free new survey.
- **Old ledger rows** are restated in hundredths (old credit × 400).

## Setup

- Set `PLATFORM_ADMIN_EMAILS` (comma-separated) in Vercel so the owner can open **/admin/pricing**. The link also appears on the Billing page for admins.
- `BILLING_ENFORCED=false` turns charging off (local and unit tests).

## Tests

- Unit (`tests/unit/pricing.test.ts`): fee gross-up, discounts (best wins; expired, future and removed ignored), premium charge, formatting.
- Integration (`tests/integration/billing.test.ts`):
  - the free first 360, then a charge at launch; nothing is charged when the balance is short
  - top-ups with fees, idempotent fulfilment
  - retired products, top-up limits and other people's payments are refused
  - pulse and follow-up prices, a person's discount, a still-active Pro plan
  - coach gifts after the client's free 360
  - company rounds with welcome credits, a company discount, an expired discount
  - policy validation and audit
  - premium AI charging that never goes below zero
- Integration (`tests/integration/workspaces.test.ts`): company premium AI uses company credits; a personal premium chat needs personal credits.
- E2E (`tests/e2e/phase9.spec.ts`):
  - buy 37 credits and check the exact fee
  - the shortfall message
  - a coach gift deducts 35 credits
  - a company owner tops up company credits
  - a platform admin edits a price and adds a discount

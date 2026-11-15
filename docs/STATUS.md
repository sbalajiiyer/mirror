# Mirror — build status

_Last updated: 2026-11-15 (Phase 1 + 2, branch `phase-1-2`)_

## Phases

| # | Phase | Status |
|---|-------|--------|
| 1 | Foundation — auth, onboarding, framework, 360 setup, invites, rater form, reminders | ✅ Done (PR from `phase-1-2`) |
| 2 | Report v1 — summary, radar, gap, Johari, heatmap, distributions, themes, PDF | ✅ Done (same PR) |
| 3 | AI layer — summaries, development plan, de-identification, framework recommendation | ⏳ Next — provider chosen (Groq + gpt-oss, premium per-use option); starts after PR #1 is merged |
| 4–10 | Pulses, coach workspace, teams/orgs, personalization v2, analytics v2, payments, enterprise | Not started |

Demo scripts: [`docs/phases/phase-1-foundation.md`](phases/phase-1-foundation.md), [`docs/phases/phase-2-report.md`](phases/phase-2-report.md).

## Run locally

Requirements: Node 22+, PostgreSQL 14+ (local install or Docker).

```bash
# 1. Database (any Postgres works; example with Docker)
docker run -d --name mirror-db -e POSTGRES_USER=mirror -e POSTGRES_PASSWORD=mirror -e POSTGRES_DB=mirror -p 5432:5432 postgres:16

# 2. App
cp .env.example .env                 # set AUTH_SECRET (openssl rand -base64 32)
                                     # for local demo: DEV_TOOLS_ENABLED=true, DEMO_LOGIN_ENABLED=true
npm install                          # also applies patches/ and runs prisma generate
npx prisma migrate deploy
npm run db:seed                      # demo subject Alex Morgan (demo@mirror.local) + 12-rater report
npm run dev                          # http://localhost:3000
```

Sign in with **Sign in as demo user** (when `DEMO_LOGIN_ENABLED=true`) or with any email — the magic link appears at
`/dev/outbox` because no email provider is configured.

### Tests

```bash
npm test                 # Vitest: unit tests; also integration tests if TEST_DATABASE_URL is set
npm run test:integration # Vitest against postgresql://…/mirror_test (create the DB and run `prisma migrate deploy` on it first)
npm run build && npm run db:seed && npm run test:e2e   # Playwright (needs `npx playwright install chromium` once)
npm run lint && npm run typecheck
```

Current results: **45 Vitest tests** (35 unit + 10 integration) and **8 Playwright tests**, all passing. CI runs everything
on every PR (`.github/workflows/ci.yml`, GitHub Actions free tier, Postgres service container).

## Decisions made (2026-11-15)

| Decision | Choice | Notes |
|---|---|---|
| **AI provider (default, free)** | **Groq free tier running open-weight `gpt-oss`** (120b for reports, 20b for light tasks) | No card needed; rate-limited. Owner creates a free key at console.groq.com → `GROQ_API_KEY`. |
| **AI for paying users** | **Premium model, billed per use** | Subjects can switch to a premium model (e.g. Claude or GPT) in settings and pay by usage. Phase 3 builds the provider interface, the model choice and usage metering; charging (Stripe) comes with Phase 9. |
| **Hosted database** | **Neon free tier** | Works with the current driver-adapter setup by changing `DATABASE_URL` (pooled string + `?sslmode=require`). |
| **Hosting** | **Vercel Hobby** | Free, non-commercial. Needs: PDF via `playwright-core` + `@sparticuz/chromium`; reminders cron is daily on Hobby (or use a GitHub Actions schedule for hourly). |

## Deployment (Vercel + Neon)

- **Neon** project `mirror` (us-east-1, free tier): `main` branch for production, `preview` branch for Vercel preview
  deployments, so feature-branch migrations never touch production data.
- **Vercel** project `mirror` (team "sbalajiiyer's projects", region iad1, Node 22). Environment variables are set for
  production and preview: `DATABASE_URL` (pooled), `DIRECT_DATABASE_URL` (migrations), `AUTH_SECRET`, `CRON_SECRET`,
  `EMAIL_PROVIDER=console`, `DEMO_LOGIN_ENABLED=true`, `DEV_TOOLS_ENABLED=false`, `SEED_DEMO_ON_BUILD=true`.
  Public URLs come from Vercel's own environment, so `APP_URL` isn't needed.
- Each build runs `scripts/vercel-build.sh`: `prisma migrate deploy`, re-seed the demo account, `next build`.
- Vercel Authentication protects **preview** deployments only; production is public (raters need it).
- Reminders: Vercel Cron, weekdays 14:17 UTC (Hobby allows one run a day).
- PDF: `@sparticuz/chromium` + `playwright-core` on Vercel (function memory 2 GB, 60 s).
- **To finish linking:** install the Vercel GitHub app on `sbalajiiyer/mirror`, then pushes to `main` deploy production
  and every PR gets a preview.
- Until an email provider is chosen, only the demo login works on the public site (magic links aren't delivered and
  the dev outbox is off there). Set `DEMO_LOGIN_ENABLED=false` in Vercel to turn the demo off.

## Still open

Nothing paid has been added. Each item below is stubbed behind an interface so it can be swapped without touching callers.

| Decision | Current stub | Options (free tier first) | Where to plug in |
|---|---|---|---|
| **Email provider** (magic links, invites, reminders) — _deferred by owner_ | `console` provider + `/dev/outbox` | **Resend** free (3,000/mo, 100/day), Postmark (100/mo free), Amazon SES (cheap, needs AWS account), any SMTP. Note: a public deployment can't sign anyone in until this is chosen, because magic links go to the outbox. | Add a sender in `src/lib/email/` and a case in `getEmailSender()` |
| **Premium AI model + price** | — | Which premium model(s) to offer and the per-use price; decide before Phase 9 billing | `src/lib/ai/` (Phase 3) |
| **PDF rendering on the host** | Playwright + local Chromium | Works as-is on containers (Azure/Docker). On Vercel: switch to `playwright-core` + `@sparticuz/chromium`, or fall back to browser print (already wired) | `src/lib/pdf/index.ts` (`PdfRenderer`) |
| **Reminder scheduling** | `GET /api/cron/reminders` + `npm run jobs:reminders` | Vercel Cron (daily on Hobby), GitHub Actions schedule (free), Inngest / Trigger.dev free tiers | `src/lib/jobs/reminders.ts` (`runReminders`) |
| **Google sign-in** | Hidden unless env vars are set | Free: create an OAuth client in Google Cloud Console | `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET` |
| SMS invites | Not built | Twilio etc. (paid) — suggest deferring | — |

## Defaults I chose (change any of these freely)

- **Auth:** Auth.js v5 (beta, the current line for Next.js App Router) with JWT sessions; Prisma adapter stores users,
  accounts and magic-link tokens. Magic links expire after 24 h. A dev-only "demo user" credentials login exists behind
  `DEMO_LOGIN_ENABLED` — keep it `false` anywhere public.
- **Rating scale:** 1–5 frequency scale (Rarely → Almost always) plus "Don't know"; raters must rate at least half the items.
- **Framework:** "Mirror Core 360" v1 — 7 competencies × 4 behaviours = 28 statements (~8 minutes). Frameworks are
  versioned (`slug` + `version`) and each assessment snapshots its questions, so later edits never change old reports.
- **Anonymity:** minimum 3 per group (configurable upward, never below 3). Small groups are pooled; a pool that's still
  too small is merged into the smallest visible group. Cell-level and complementary suppression. Manager shown
  separately only on opt-in (and the manager is told). If the manager is shown separately, the remaining raters alone
  must still reach the minimum.
- **Report timing:** the report is computed once when the subject **closes** the 360 and is then frozen. This blocks
  "diff the report after each new response" attacks. Reopening is allowed only if the closed report showed nothing.
- **No identity on answers:** `Submission` has no foreign key to `RaterInvite`, no IP/user agent, a random UUID id
  (cuid ids embed timestamps) and only a day-granularity date. Invites only record *that* someone responded.
- **Rater links:** HMAC-derived from the invite id with `AUTH_SECRET`; only a SHA-256 hash is stored. This lets reminders
  re-send the same link without storing it. Rotating `AUTH_SECRET` invalidates outstanding rater links.
- **Shareable group links:** optional per group; each new visitor gets their own anonymous invite (remembered in a cookie).
  Note: anyone with the link can respond, so use them only for groups you trust.
- **Reminders:** day 3 and day 7 after invite, plus a final one ≤2 days before the due date; max 3, ≥48 h apart,
  weekdays 09:00–17:00 **UTC** (per-user time zones later).
- **Johari window:** quadrants split at the person's own average self and others scores (relative, not normative).
  "Blind spot"/"hidden strength" in the summary use an absolute gap of ≥0.3.
- **Open text (pre-AI):** keyword dictionary of 11 themes, a small sentiment lexicon, word frequencies.
- **Charts:** Recharts (radar) + D3 scales with hand-built SVG (gap chart, distributions, heatmap). Colours come from a
  CVD-validated categorical palette: self = orange, all others = blue, groups in fixed slots; heatmap uses a single-hue ramp.
- **PDF:** Playwright renders `/print/report/<id>` (signed 2-minute token) to A4 with page numbers.
- **Fonts:** Geist via the `geist` npm package (no Google Fonts fetch at build time).

## Implementation notes

- **Prisma without native engines.** The schema uses `engineType = "client"` and the node-postgres driver adapter at
  runtime, and `prisma.config.ts` runs migrations through the Wasm schema engine. Nothing downloads from
  `binaries.prisma.sh`, so it works in locked-down CI/sandboxes and on serverless hosts. `patches/@prisma+adapter-pg+6.19.3.patch`
  (applied by `patch-package` on install) fixes two small upstream bugs in that path: system-catalog column types and
  shadow-database naming/cleanup. Revisit when upgrading to Prisma 7.
- **shadcn/ui** components in `src/components/ui/` were added by hand (same source as the CLI's new-york style) because the
  shadcn registry wasn't reachable from the build sandbox; `components.json` is in place, so `npx shadcn add <component>`
  works normally from your machine.
- Business rules live in `src/lib/services/*` and `src/lib/anonymity.ts`; pages and server actions are thin wrappers.

## Known limitations / next up

- Custom questions get a first-person wording by replacing `{name}` with "I" — grammar may need a manual edit.
- Rater form is English-only; multi-language and a full WCAG 2.2 AA audit are still to do (semantic radios, labels,
  focus rings and contrast are in place).
- No rate limiting yet on the public rater endpoints (tokens are 256-bit, so guessing isn't practical; add limits before launch).
- `RaterInvite.submittedAt` is stored at day granularity like `Submission.submittedOn`, but row insertion order in Postgres
  could still correlate the two for someone with raw DB access; acceptable for now, revisit with an append-only shuffle job.
- Text de-identification (AI rewrite) is Phase 3; until then raters are reminded not to include identifying details.
- Benchmarks, time filters and trends need more data/phases (2+ assessments → Phase 4).
- Dark-mode tokens exist but there is no theme toggle yet.

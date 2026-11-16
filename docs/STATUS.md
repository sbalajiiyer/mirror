# Mirror — build status

_Last updated: 2026-11-16 (Phase 6, branch `phase-6`)_

## Phases

| # | Phase | Status |
|---|-------|--------|
| 1 | Foundation — auth, onboarding, framework, 360 setup, invites, rater form, reminders | ✅ Done (PR #1, merged) |
| 2 | Report v1 — summary, radar, gap, Johari, heatmap, distributions, themes, PDF | ✅ Done (PR #1, merged) |
| 3 | AI layer — summaries, development plan, de-identification, framework recommendation | ✅ Done (PR #3, merged) |
| 4 | Pulses and progress — pulse surveys, trend lines, before/after, goal tracker, streaks; plus custom questionnaires (free) and AI-generated questionnaires (credits) | ✅ Done (PR #4, merged) |
| 4b | Survey IDs, numbered sessions, Run again (same questionnaire, same raters), session-based trends | ✅ Done (PR #5, merged) |
| — | Launch hardening — rate limits, WCAG 2.2 AA audit and fixes, pulse titles by session | ✅ Done (PR #6, merged) |
| — | Session grouping — company and tags on sessions; group and filter by company, year, quarter, theme, score range | ✅ Done (PR #7, merged) |
| — | Questionnaire import — Excel (.xlsx) / CSV, including Google Forms and Microsoft Forms exports | ✅ Done (PR #8, merged) |
| 5 | Coach workspace — client portfolio, consent-based sharing, session prep (+AI), shared reports, notes, coaching sessions, cross-client analytics, white-label, coach questionnaires | ✅ Done (PR #10, merged) |
| 6 | Teams and orgs — organizations, people, teams & cohorts, 360 rounds (incl. team 360), participation, team radar/heatmap, cohort comparison, opt-in talent grid (HRIS skipped by owner) | ✅ Done (PR from `phase-6`) |
| 7–10 | Personalization v2, analytics v2, payments, enterprise | Not started |

Demo scripts: [`docs/phases/phase-1-foundation.md`](phases/phase-1-foundation.md), [`docs/phases/phase-2-report.md`](phases/phase-2-report.md), [`docs/phases/phase-3-ai.md`](phases/phase-3-ai.md), [`docs/phases/phase-4-pulses-progress.md`](phases/phase-4-pulses-progress.md), [`docs/phases/phase-4b-survey-sessions.md`](phases/phase-4b-survey-sessions.md), [`docs/phases/phase-5-coach.md`](phases/phase-5-coach.md), [`docs/phases/phase-6-teams-orgs.md`](phases/phase-6-teams-orgs.md).

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

Current results: **159 Vitest tests** and **39 Playwright tests** (including automated WCAG 2.2 AA checks with axe), all passing. CI runs everything
on every PR (`.github/workflows/ci.yml`, GitHub Actions free tier, Postgres service container).

## Decisions made (2026-11-15)

| Decision | Choice | Notes |
|---|---|---|
| **AI provider (default, free)** | **Groq free tier running open-weight `gpt-oss`** (120b for reports, 20b for light tasks) | No card needed; rate-limited. Owner creates a free key at console.groq.com → `GROQ_API_KEY`. |
| **AI for paying users** | **Premium model, billed per use** | Subjects can switch to a premium model (e.g. Claude or GPT) in settings and pay by usage. Phase 3 builds the provider interface, the model choice and usage metering; charging (Stripe) comes with Phase 9. |
| **Hosted database** | **Neon free tier** | Works with the current driver-adapter setup by changing `DATABASE_URL` (pooled string + `?sslmode=require`). |
| **Paid AI questionnaire** | **Credits, granted manually until Stripe (Phase 9); $4.99 = 1 credit** | Building your own questionnaire is free. `npm run credits:grant -- <email> <n>`; every change is in `CreditLedger`. Price via `NEXT_PUBLIC_AI_QUESTIONNAIRE_PRICE_CENTS`. |
| **Hosting** | **Vercel Hobby** | Free, non-commercial. Needs: PDF via `playwright-core` + `@sparticuz/chromium`; reminders cron is daily on Hobby (or use a GitHub Actions schedule for hourly). |

## Deployment (Vercel + Neon)

- **Neon** project `mirror` (us-east-1, free tier): `main` branch for production, `preview` branch for Vercel preview
  deployments, so feature-branch migrations never touch production data.
- **Live:** https://mirror-360.vercel.app
- **Vercel** project `mirror-360` (team "sbalajiiyer's projects", region iad1, Node 22), linked to this repo: `main` →
  production, every PR → a protected preview. (An earlier unlinked project named `mirror` can be deleted.) Environment variables are set for
  production and preview: `DATABASE_URL` (pooled), `DIRECT_DATABASE_URL` (migrations), `AUTH_SECRET`, `CRON_SECRET`,
  `EMAIL_PROVIDER=console`, `DEMO_LOGIN_ENABLED=true`, `DEV_TOOLS_ENABLED=false`, `SEED_DEMO_ON_BUILD=true`.
  Public URLs come from Vercel's own environment, so `APP_URL` isn't needed.
- Each build runs `scripts/vercel-build.sh`: `prisma migrate deploy`, re-seed the demo account, `next build`.
- Vercel Authentication protects **preview** deployments only; production is public (raters need it).
- Reminders: Vercel Cron, weekdays 14:17 UTC (Hobby allows one run a day).
- PDF: `@sparticuz/chromium` + `playwright-core` on Vercel (function memory 2 GB, 60 s).
- `GROQ_API_KEY` must be added to the `mirror-360` project (Production + Preview) to switch from standard text to real AI.
- Prisma's Wasm query compiler is shipped to every function via `outputFileTracingIncludes` in `next.config.ts`.
- Until an email provider is chosen, only the demo login works on the public site (magic links aren't delivered and
  the dev outbox is off there). Set `DEMO_LOGIN_ENABLED=false` in Vercel to turn the demo off.

## Still open

Nothing paid has been added. Each item below is stubbed behind an interface so it can be swapped without touching callers.

| Decision | Current stub | Options (free tier first) | Where to plug in |
|---|---|---|---|
| **Email provider** (magic links, invites, reminders) — _deferred by owner_ | `console` provider + `/dev/outbox` | **Resend** free (3,000/mo, 100/day), Postmark (100/mo free), Amazon SES (cheap, needs AWS account), any SMTP. Note: a public deployment can't sign anyone in until this is chosen, because magic links go to the outbox. | Add a sender in `src/lib/email/` and a case in `getEmailSender()` |
| **Premium AI model + price** | Catalog entries for Claude and GPT, off by default (`PREMIUM_AI_ENABLED=false`); placeholder price $0.02 per 1K tokens | Which premium model(s) to offer, their model ids and the per-use price; decide before Phase 9 billing | `src/lib/ai/models.ts`, env vars in `.env.example` |
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

## Phase 3 defaults (change freely)

- **AI is on demand:** the subject clicks to write the summary or plan (keeps the free quota for people who want it).
  Results are stored and shown in the PDF.
- **Daily caps** per user: 10 summaries, 10 plans, 20 recommendations, 20 invite drafts; 40 de-identifications per rater link.
- **De-identification is on by default** for raters (they can untick it); the AI rewrite replaces the original, which
  is never stored. Emails/phones/links/handles are always scrubbed.
- **What's sent to the model:** competency scores and gaps, top/bottom behaviours, comment themes with up to two
  scrubbed quotes each (group-labelled), Start/Stop/Continue theme counts, goal, role, career stage, industry,
  learning style and tone. No names, emails or ids.
- **Groq models:** `openai/gpt-oss-120b` for summaries/plans, `openai/gpt-oss-20b` for short tasks (overridable).
- **Premium:** catalog and per-use metering only; nobody is charged until payments (Phase 9).

## Phase 4 defaults (change freely)

- **Pulses** are 5–10 statements picked from the 360 they follow (default: goals, then blind spot and growth areas,
  lowest-rated statements first). They reuse the same raters with fresh links (declined raters are skipped), and follow
  the same self-first, anonymity and close-to-report rules.
- **Like-for-like progress:** trends, before/after and goals compare a competency only on statements both check-ins
  asked, and show how many. Statements are matched by framework question key (or text for custom questions).
- **Rhythm:** 1, 2 or 3 months, set when creating a pulse or on the Progress page. The next due date is counted from
  the latest launch. The reminder email goes once per due date via the daily cron.
- **Streak:** consecutive pulses each closed within 1.5× the rhythm of the previous one. It pauses when the latest is
  older than that.
- **Goals:** default target is the starting score + 0.5 (capped at the scale). Achieved automatically when a later
  check-in reaches it. One active goal per competency per 360.
- **Custom questionnaires:** 1–10 sections, 1–8 statements each, 5–60 in total. Editing a questionnaire never changes
  past 360s, because each assessment keeps its own copy of the questions.
- **AI questionnaire:** uses the subject's chosen model (free Groq gpt-oss by default) and costs 1 credit. Charged only
  on success; daily cap 5.

## Survey session defaults (change freely)

- **Survey ID** `MRR-XXXXXX`: a hash of the first session's id (no lookup table, stable, not sequential).
- **Sessions** are numbered per survey across full re-runs and pulses. The default name is month + year, editable anytime.
- **One open session per survey.** Run again and Pulse check are blocked (UI and server) until it closes.
- **Run again** copies the first session's questionnaire exactly and, by default, the same raters with new links
  (declined raters skipped). Due in 14 days by default (3–30).
- **Progress** uses the report's own competency score when a comparison covers all of a session's statements, so
  Progress and the report always show the same number.

## Launch hardening (2026-11-16)

**Rate limits** (fixed windows, counted in Postgres; no extra service). Over the limit, people see a friendly
"Please slow down" message, and saves and submits return an error asking them to wait.

| What | Limit |
|------|-------|
| Unrecognised rater links per network | 10 / 15 min (then rater links are blocked for that network until the window ends) |
| Rater page views per network | 120 / 10 min |
| Draft saves, submits, declines per network / per link | 300 / 10 min · 120 / 10 min |
| AI de-identify previews per link | 15 / hour |
| New invites from a group share link, per network / per link | 10 / hour · 200 / day |
| Sign-in emails per address / per network | 5 / hour · 20 / hour |
| Demo sign-ins per network | 60 / 10 min |

- Privacy: counters are keyed by HMAC(scope + IP/token/email), never raw values. Per-network and per-link counters are
  separate rows and can't be joined. Rows are pruned by the daily cron after about a day.
- If the counter database call fails, the request is allowed (fail-open) and the error is logged.
- `RATE_LIMIT_DISABLED=true` turns it off (load tests only). The demo seed clears the counters.

**Accessibility (WCAG 2.2 AA).** Automated axe checks run in CI on sign-in, dashboard, report, Progress,
questionnaires, new-360 wizard, settings and the rater form (phone size), in light and dark mode. Manual review and fixes:
- Heatmap text colour is now picked for contrast on each cell. One ramp colour was darkened, and a unit test checks
  every cell meets 4.5:1.
- "Skip to content" link on every page; `main` is focusable.
- Rater form: moving between sections moves focus to the new section, so keyboard and screen-reader users start at
  the top. Rating scales are native radio groups.
- Report: gap-chart rows are keyboard buttons (Enter or Space opens details) with a visible focus ring. Heatmap rows
  have a button on the competency name. The competency picker uses toggle buttons with `aria-pressed`. The radar
  chart's accessible label lists every competency's self and others' scores.
- "Reduce motion" is respected: CSS transitions and chart animations are switched off, and scrolling is instant.
- Still worth doing before a big launch: a session with a real screen-reader user (VoiceOver/NVDA) and a 200%-zoom
  pass on the report charts.

**Pulse titles** now follow the survey and session: "Pre-promotion 360 — Autumn 2026 · S4 Pulse check". Existing
pulses were renamed by migration `rate_limit_pulse_titles`.

## Session grouping (2026-11-16)

- Each session can have a **company** (asked in the new-360 wizard, editable in the session header) and up to 8
  **tags** (lower-cased). New sessions (Run again, pulses) copy them from the session they were started from.
- **My 360s → Group by:** Survey (default), Company, Year, Quarter, Theme, Score range. Filters: company (including
  "No company set"), year, tag, and score from/to. The settings live in the URL (`/dashboard?group=company&tag=promotion`),
  so a view can be bookmarked.
- **Theme** groups combine your tags (#tag), the 3 most-mentioned comment themes and the report's strengths and growth
  areas. A session can appear under several themes.
- **Score range** uses others' overall average in bands of 0.5 (1–5 scale). Sessions without a visible report (still
  open, or too few responses) sit in "No visible scores yet". A group's average mixes full 360s and pulses, so treat it
  as a rough guide; Progress stays the like-for-like view.
- Only the subject's own, already-anonymised report figures are used, so grouping can't reveal anything about raters.

## Questionnaire import (2026-11-16)

- **Questionnaires → Build or import your own** now starts with an import box. Supported files: `.xlsx` and `.csv`
  (up to 1 MB). Old `.xls` files get a "save as .xlsx or .csv" message. Import is free, and nothing is saved until the
  user reviews the draft in the builder and clicks Save.
- **Layouts are detected automatically:**
  - the Mirror template (`/templates/mirror-questionnaire-template.csv`: Section, Statement, optional self wording
    and section description)
  - Google Forms or Microsoft Forms response exports: column headers become statements, the
    timestamp/email/ID/name columns are skipped, grid questions "Q [item]" become section Q, and **answers are never
    read**
  - two unlabelled columns (section, statement)
  - a plain list
- **Wording:** "Communicates clearly" becomes "{name} communicates clearly"; "1." and "Q3:" numbering is stripped; the
  self-assessment wording is generated. Items that are questions, or don't mention the person, are flagged for review.
- **Limits:** sections over 8 statements are split, with a note. Only the first 10 sections and 60 statements are kept.
- **Libraries:** `read-excel-file` (xlsx) and `papaparse` (csv), both free and MIT-licensed. SheetJS's official
  package couldn't be installed from its CDN here.
- **Not done:** importing straight from a Google Forms link. That needs Google OAuth and Google's app verification
  (weeks), so it stays an open option. Past responses from other tools are deliberately not imported (Mirror can't
  vouch for their anonymity).

## Phase 5 defaults (change freely)

- **Coach accounts are free** until payments (Phase 9). Anyone can create a coach profile from **Coaching → I'm a
  coach**, and accepting a client's request creates one automatically.
- **Consent model:** the client opts in, chosen by the owner on 2026-11-16. Invitations are emailed, single-use, and only
  valid for the invited address (signing in with another account shows a "sign in with that address" message).
- **Default sharing:** reports on, comments off, goals on, plan off, branding on. Status and response counts are always
  visible to an active coach.
- **Session prep** is deterministic: report summary, changes vs the previous session in the same survey (like-for-like
  statements), goals, and a question bank per built-in competency. **Write with AI** is optional (`coach_brief`, 20 a
  day, free model by default) and only sees aggregates.
- **Cross-client analytics:** latest full 360 per client; each figure needs ≥ 5 clients (`MIN_CLIENTS`).
- **White-label:** brand name and colour on the client's report and PDF ("Prepared with …"). If a client has several
  coaches, the most recently accepted coach with a brand is used. No logo upload yet (no file storage).
- **Coach questionnaires:** a coach's own questionnaires are offered to their active clients in the wizard, labelled
  "From your coach …".
- **Demo:** `coach@mirror.local` (Jordan Lee) with six clients. Second demo button on the sign-in page.

## Phase 6 defaults (change freely)

- **Privacy model** (owner decision, 2026-11-16): aggregates plus opt-in.
  - Admins see participation and group figures with at least 5 people.
  - Individual reports only with the person's consent, and never raters' comments word for word.
  - Only 360s started from an org round count; personal 360s never do.
- **Talent grid** (owner decision): opt-in, with a performance rating the admin enters (low, medium, high) against the
  360 behaviours band. It is labelled a development tool.
- **HRIS:** skipped (owner decision). Admins paste a list exported from any HR system.
- **Orgs are free**, and anyone can create one (owner decision). Per-participant pricing comes in Phase 9.
- **Team 360:** in a round for a team, teammates are pre-filled as raters (the "Teammates" group). People can add or
  remove raters.
- **Heatmap names** people only when the people not named are either none or at least 5.
- **Demo:** `admin@mirror.local` (Morgan Blake) for Brightline Studio. Alex is a member with sharing on.

## Known limitations / next up

- Custom questions get a first-person wording by replacing `{name}` with "I" — grammar may need a manual edit.
- Rater form is English-only by the owner's choice (2026-11-16); multi-language can come later.
- Next: Phase 7 (personalization v2: AI coach chat, adaptive questions, sharing and badges).
- Coaches who accept by email go through the subject onboarding first; a coach-specific onboarding would be nicer.
- The header nav is hidden on small screens (no mobile menu yet).
- Dependency audit (2026-11-16): `next-auth` upgraded to 5.0.0-beta.32 (fixes the email normalisation /
  misdelivery advisories). Sign-in emails also go through our own stricter normaliser (`src/lib/email-address.ts`:
  Unicode NFKC, ASCII only, exactly one "@"). `postcss` is pinned to ≥ 8.5.33 via `overrides` (it was bundled by
  Next). Remaining `npm audit` items are development-time only (the Prisma CLI's `deepmerge-ts`, typescript-eslint's
  `minimatch`). Their fixes need major upgrades (Prisma 7, Next 16), which are planned separately.
- `RaterInvite.submittedAt` is stored at day granularity like `Submission.submittedOn`, but row insertion order in Postgres
  could still correlate the two for someone with raw DB access; acceptable for now, revisit with an append-only shuffle job.
- The Groq API couldn't be reached from the build sandbox, so real Groq calls were tested only with a stubbed HTTP layer; `GROQ_API_KEY` is set on Vercel Production (2026-11-16); not yet on Preview.
- Comment themes are still keyword-based; the AI summary reads them but doesn't re-cluster comments yet.
- Benchmarks need anonymised norms across many users (Phase 8).
- Buying credits needs Stripe (Phase 9); until then credits are granted with `npm run credits:grant`.
- Dark-mode tokens exist but there is no theme toggle yet.

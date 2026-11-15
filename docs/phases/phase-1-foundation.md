# Phase 1 — Foundation: demo script

**Built:** auth (email magic link, optional Google, dev-only demo login), subject onboarding with goals, the built-in
"Mirror Core 360" framework (7 competencies × 4 behaviours), the full 360 setup wizard with rater groups, tokenized
rater invites (email stubbed behind `EmailSender`), the anonymous mobile-first rater form with save & resume, a locked
self-assessment, the reminder job, and server-side anonymity thresholds.

## Setup (once)

```bash
cp .env.example .env              # set AUTH_SECRET; for the demo set DEV_TOOLS_ENABLED=true and DEMO_LOGIN_ENABLED=true
npm install
npx prisma migrate deploy
npm run db:seed
npm run dev                        # http://localhost:3000
```

## Walkthrough (≈10 minutes)

1. **Sign in with a magic link.** Go to `/signin`, enter any email, submit. Open `/dev/outbox` and click the link
   (no email provider is configured, so mails land in the outbox). You arrive at **onboarding**.
2. **Onboarding.** Enter your name, optionally role/stage/industry, pick 1–3 goals and a feedback tone → dashboard.
3. **Set up a 360** (`New 360`):
   - *Goal* — choose one, edit the name.
   - *Framework* — Mirror Core 360 v1 (the only built-in one for now).
   - *Questions* — untick a statement, edit wording, add a custom one (`{name}` = your first name).
   - *Raters* — add 3+ peers (try "Paste a list" with `Sam <sam@example.com>` lines); tick "shareable link" on a group.
   - *Settings* — invite message, due date, minimum per group (can't go below 3), manager-separate opt-in.
   - *Review* → **Create & rate myself**.
4. **Self-assessment.** Rate all 28 statements → **Submit & lock**. Try opening `/assessments/<id>/self` again: it
   redirects — the self-assessment is locked before anyone else responds.
5. **Send invites.** On the 360 page click **Send invites**. Each rater appears as "Invited"; their emails (with personal
   links) are in `/dev/outbox`.
6. **Be a rater** (open a link in a private window, ideally on a phone-sized viewport):
   - Note the anonymity notice, the time estimate and "I'd rather not give feedback".
   - Answer a section, close the tab, reopen the link → it resumes where you left off ("Progress saved").
   - Finish, add Start/Stop/Continue comments, submit → "Thank you!". Reopening the link says you already responded.
7. **Progress tracker.** Back on the 360 page: per-group progress, "n more to show separately", per-person status,
   add/remove raters, and the shareable group link (copy it into another browser to respond as a link rater).
8. **Anonymity threshold.** Close the 360 with only 2 responses → "too few responses" and no data is shown;
   **Reopen** is offered (allowed only when nothing was revealed). Collect a 3rd response and close again → report.
9. **Reminders.** `npm run jobs:reminders` (or `curl -H "Authorization: Bearer $CRON_SECRET" localhost:3000/api/cron/reminders`)
   sends due reminders (day 3, day 7, and 2 days before the due date; weekdays 09–17 UTC; max 3).

## Files

- Schema & migration: `prisma/schema.prisma`, `prisma/migrations/*_init`
- Auth: `src/auth.ts`, `src/app/(app)/signin/*`, `src/lib/session.ts`
- Onboarding: `src/app/(app)/onboarding/*`
- Framework: `src/lib/frameworks/core-360.ts`, `src/lib/frameworks/sync.ts`
- Wizard: `src/app/(app)/assessments/new/*`, `src/lib/validation.ts`
- Lifecycle & rules: `src/lib/services/assessments.ts`, `src/lib/services/raters.ts`, `src/lib/anonymity.ts`
- Rater form: `src/app/r/*`, `src/components/questionnaire/questionnaire.tsx`
- Email: `src/lib/email/*`; reminders: `src/lib/jobs/reminders.ts`, `src/app/api/cron/reminders/route.ts`

## Tests

- `tests/unit/anonymity.test.ts`, `tests/unit/reminders.test.ts`, `tests/unit/tokens.test.ts`
- `tests/integration/assessment-flow.test.ts` (self-lock, ownership, invite → submit with no identity link, gating, reopen rule)
- `tests/e2e/auth.spec.ts` (magic link → onboarding → dashboard; protected-page redirect)
- `tests/e2e/rater-flow.spec.ts` (wizard → self → launch → 3 mobile raters incl. save/resume → close → report)

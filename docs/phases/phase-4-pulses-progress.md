# Phase 4 — Pulses, progress and custom questionnaires: demo script

**Built:**
- **Pulse checks:** short (5–10 statement) repeat 360s with the same raters, plus a monthly, 2-monthly or quarterly
  rhythm with pulse-due reminders.
- **Progress page:** trend lines per competency, a before/after radar, goals tracked against pulses, and streaks.
- **Questionnaires (added at the owner's request):**
  - build your own questionnaire **for free**
  - or have **AI generate one for 1 credit ($4.99)**

## Setup

As before, then `npx prisma migrate deploy` (migrations `phase4_pulses_goals_custom`, `phase4_credits`) and
`npm run db:seed`. The demo user now has:
- a closed pulse check after their 360
- a goal ("Raise communication to 3.6")
- a monthly pulse rhythm
- 3 credits

## Walkthrough (≈10 minutes)

1. **Progress.** Sign in as the demo user → **Progress**.
   - Check-ins: 2. Streak: 1. Next pulse due date.
   - The communication goal shows as *Achieved*.
   - Trend charts for the three competencies the pulse re-measured; Communication rose from 3.2 to 3.6.
   - **Before and after:** pick any two check-ins. The table shows how many statements each comparison is based on.
2. **Like-for-like rule.** A pulse re-asks only some statements. Every trend, comparison and goal therefore uses only
   the statements both check-ins asked; each chart says how many. Example: Leadership compares just the "delegates"
   item, 3.3 → 3.8, not the full four-statement average.
3. **Start a pulse.** Open the 360 report → **Start a pulse check**.
   - Suggested statements come from goals first, then the blind spot and growth areas, lowest-rated first.
   - "Ask the same 12 people again" is on. Pick a rhythm and how many days raters have.
   - **Create pulse & rate myself** → self-assessment → **Send invites**.
   - Raters get "Quick check-in … about 2 minutes" emails with fresh anonymous links.
4. **Goals.** On Progress, add a goal from *New goal*. You can also use **Make this a goal** on a development-plan
   area. Change the target or archive a goal. Goals are marked achieved automatically when a later pulse reaches the
   target.
5. **Rhythm and reminders.** Change *Pulse rhythm* on Progress. When a pulse is due, the daily cron
   (`/api/cron/reminders` or `npm run jobs:reminders`) emails the subject a link to start it, once per due date.
6. **Build your own questionnaire (free).** **Questionnaires** → **Start building**.
   - Name it and add sections and statements starting with `{name}`. First-person wording for the
     self-assessment is filled in automatically ("{name} listens carefully" → "I listen carefully") and stays editable.
   - Save → **Use in a new 360**. The wizard pre-selects it.
7. **AI-generated questionnaire (1 credit = $4.99).** **Questionnaires** → **Generate a questionnaire**.
   - Describe what you want feedback on → **Generate for 1 credit**.
   - The result is saved as your questionnaire. Editing it afterwards is free.
   - The credit is only spent if generation succeeds; the balance goes from 3 to 2.
8. **Credits until payments exist.** `npm run credits:grant -- someone@example.com 3`. For production, prefix it with
   the Neon `DATABASE_URL`. Every change is recorded in `CreditLedger`. Stripe purchases plug into the same ledger in
   Phase 9.

## Rules enforced on the server

- **Custom questionnaires** can only be read, edited or used by their owner. `createAssessment` checks ownership.
- **Credits** can't go negative or be double-spent: a guarded decrement inside a transaction, tested with two
  parallel requests.
- **AI output limits:** generated questionnaires go through the same validation as hand-built ones (5–60
  statements, ≤10 sections, ≤8 per section).
- **Pulses** follow the normal anonymity rules: minimum 3 per group, pooling, report generated on close. Self-assessment
  comes first and is locked.

## Files

- **Schema:** `prisma/schema.prisma` (Assessment.type PULSE, rootAssessmentId, cadence; Goal; CreditLedger;
  Framework.ownerId/source; SubjectProfile.aiCredits).
- **Logic:** `src/lib/progress.ts` (pure), `src/lib/questionnaire.ts`, `src/lib/services/{pulses,goals,frameworks,credits}.ts`,
  `src/lib/ai/features/questionnaire.ts`, pulse reminders in `src/lib/jobs/reminders.ts`.
- **UI:** `src/app/(app)/progress`, `src/components/progress/progress-view.tsx`, `src/app/(app)/assessments/[id]/pulse/new`,
  `src/app/(app)/questionnaires/*`, `src/components/questionnaire-builder/*`, plus wizard framework picker.
- **Scripts:** `scripts/grant-credits.ts` (`npm run credits:grant`).

## Tests

- `tests/unit/progress.test.ts`: like-for-like comparisons, trends, goal progress, streaks, default pulse questions.
- `tests/unit/questionnaire.test.ts`: first-person conversion, validation, slugs.
- `tests/integration/phase4.test.ts`:
  - custom questionnaire CRUD and ownership
  - no AI call without credits
  - exactly 1 credit charged and recorded
  - no charge on failure or unusable output
  - no double-spend in parallel
  - pulse creation: same raters, new tokens, declined raters skipped
  - launch schedules the next pulse
  - pulse-due email sent once
  - goal rules
  - questionnaire in use can't be deleted
- `tests/e2e/phase4.spec.ts`: builder → wizard, AI generation spends a credit, progress page, pulse from a report.

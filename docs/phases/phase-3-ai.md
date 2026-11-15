# Phase 3 — AI layer: demo script

**Built:** AI report summary, AI development plan, rater comment de-identification, framework/focus recommendation,
AI-drafted invite messages, and a model choice: free by default (Groq free tier, open-weight `gpt-oss`) with opt-in
premium models metered per use.

## Setup

- Locally: as in Phase 1, then `npx prisma migrate deploy` (new migration `phase3_ai`). Without `GROQ_API_KEY`,
  development uses deterministic **sample text** (labelled as such) so everything works offline.
- With real AI: set `GROQ_API_KEY` (free at console.groq.com, no card) in `.env` or in Vercel → project
  **mirror-360** → Settings → Environment Variables (Production + Preview), then redeploy.

## Walkthrough (≈8 minutes)

1. **AI summary.** Sign in as the demo user → open *Pre-promotion 360* → **Write my AI summary**. A paragraph plus
   "What others value" / "Where to grow" appears above the score summary, with a label saying which model wrote it.
   **Regenerate** rewrites it. It's included in the PDF.
2. **Development plan.** Click **Development plan** → choose how you like to learn → **Create my development plan**.
   For each focus area (blind spot + lowest-rated competencies): why it matters (citing your data), 3–5 actions,
   a practice exercise, resources, 30/60/90-day milestones and who to ask for help. Tick actions; progress is saved.
   **Make a new plan** regenerates it.
3. **Recommendation in the wizard.** **New 360** → pick *Grow as a leader* → on *Framework* click **Recommend a focus
   for me**. Recommended competencies are highlighted with a reason; **Use only these** trims the survey to them.
4. **AI-drafted invite.** On *Settings* (wizard step 5) click **Draft with AI** — edit it so it sounds like you.
5. **De-identification (rater side).** Open any rater link → on *In your own words*, "Remove details that could
   identify me" is on by default. **Preview rewritten comments** shows what will be stored. On submit, the AI rewrite
   is saved and the original is discarded. Emails, phone numbers, links and @handles are always removed, even with the
   box unticked.
6. **Model choice.** **Settings** → *AI model*: "Standard (free)" is selected. Premium options show "Coming soon"
   until `PREMIUM_AI_ENABLED=true` and a provider key/model are set; then they show a per-use price, and usage this
   month is shown below. Tone and learning style also live here.
7. **Resilience.** Remove the key or block the network: every feature still works, using the standard summary/plan
   and showing "AI was unavailable".

## Privacy and safety rules (enforced in code)

- Only anonymised aggregates and group-labelled, scrubbed quotes are sent to the model; never names, emails or ids
  (`reportDigest` in `src/lib/ai/features/summary.ts`, tested in `tests/integration/ai.test.ts`).
- Shared guardrails forbid diagnoses, health inferences and personality labels (`src/lib/ai/prompts.ts`).
- Model output is validated with zod; invented competency keys are discarded.
- `AIInteractionLog` stores metadata only (feature, model, tokens, cost, status), never prompts or outputs. Rater calls
  are keyed by a hash of the invite id, never by identity.
- Daily caps per user and feature (`DAILY_LIMITS` in `src/lib/ai/client.ts`) protect the free quota and premium spend.
- Raters always use the free model; a subject's premium choice never applies to raters.

## Files

- Core: `src/lib/ai/{types,models,client,prompts,scrub}.ts`, `src/lib/ai/providers/*`
- Features: `src/lib/ai/features/{summary,plan,deidentify,framework,invite}.ts`
- Services & actions: `src/lib/services/ai.ts`, `src/app/(app)/assessments/ai-actions.ts`, `src/app/r/actions.ts`
- UI: `src/components/ai/ai-summary-card.tsx`, `src/app/(app)/assessments/[id]/plan/*`, `src/app/(app)/settings/*`,
  wizard + questionnaire updates
- Migration: `prisma/migrations/*_phase3_ai` (Report.aiSummary, DevelopmentPlan, AIInteractionLog, profile aiModel/learningStyle)

## Tests

- `tests/unit/ai.test.ts`: JSON extraction, scrubbing, model catalog and pricing, guardrails, fallback recommendation
- `tests/integration/ai.test.ts`: de-identification at submit, summary (payload has no identities, metering),
  provider failure and bad JSON fall back, plan creation and action tracking with ownership checks, invented keys
  ignored, daily cap, not-ready reports refused
- `tests/e2e/ai.spec.ts` and the de-identification preview step in `tests/e2e/rater-flow.spec.ts`

# Phase 2 — Report v1: demo script

**Built:** the interactive individual report — summary card, radar (self vs. all others vs. each rater group), self-vs-others
gap chart, Johari window, rater-group heatmap, per-question score distributions with agreement, highest/lowest behaviours,
keyword-grouped open-text themes with sentiment and word cloud, Start/Stop/Continue board — plus PDF export.

## Setup

Same as Phase 1, then `npm run db:seed`. The seed creates **Alex Morgan** (`demo@mirror.local`) with a closed 360 and
12 raters: manager (opted in to be shown separately), 4 peers, 4 direct reports, 3 clients.

## Walkthrough (≈5 minutes)

1. `/signin` → **Sign in as demo user (Alex)** → open **Pre-promotion 360 — Autumn 2026**.
2. **Summary card** — top 3 strengths (Execution, Strategic thinking, Collaboration), growth areas, the biggest blind spot
   (Communication: self 4.3 vs others 3.2) and the hidden strength (Strategic thinking: self 3.3 vs others 4.1).
   The paragraph is template-generated; the AI summary is Phase 3.
3. **Competency profile** — radar of self (dashed orange) vs all others (blue). Toggle rater-group chips to overlay
   Manager / Peers / Direct reports / Clients. Hover for values.
4. **Self vs. others** — diverging bars; red = you rate yourself higher (blind spot), blue = others rate you higher.
   Click a bar to jump to that competency's questions.
5. **Johari window** — open strengths / blind spots / hidden strengths / development areas, split at Alex's own averages.
6. **By rater group** — heatmap of competencies × groups with n per group. Manager shows n=1 only because the subject
   opted in (the manager was told on the rater form). Hidden cells (too few answers) are hatched.
7. **Behaviours** — highest and lowest rated statements.
8. **Question detail** — pick a competency tab: one dot per rating, others' mean, Alex's self rating, agreement badge,
   and competency comments.
9. **What people said** — comments grouped into themes by keyword, with sentiment and representative quotes labelled
   only by rater group; word cloud.
10. **Start · Stop · Continue** — suggestions grouped by theme.
11. **Download PDF** — a 9-page A4 PDF rendered from the print view (`/print/report/<id>`), or use the print button.

## Anonymity rules on display (all enforced server-side in `src/lib/anonymity.ts`)

- Report is generated once, **when the 360 is closed**, and frozen — the subject can't diff "before/after one more response".
- Groups under the minimum are pooled; a pool that's still too small is merged into the smallest visible group.
- Cell-level suppression with complementary suppression for "don't know" answers.
- Comments shuffled deterministically, labelled by reporting group; no names, emails, timestamps or ids in the payload.

## Files

- Computation: `src/lib/report/compute.ts`, `src/lib/text/themes.ts`, `src/lib/services/reports.ts`
- UI: `src/components/report/*`, `src/app/(app)/assessments/[id]/report/page.tsx`
- PDF: `src/lib/pdf/index.ts`, `src/app/print/report/[id]/page.tsx`, `src/app/api/assessments/[id]/report/pdf/route.ts`
- JSON API: `src/app/api/assessments/[id]/report/route.ts`
- Demo data: `prisma/seed.ts`

## Tests

- `tests/unit/report-compute.test.ts`, `tests/unit/themes.test.ts`
- `tests/e2e/report.spec.ts` (all sections render, group filter + drill-down, PDF download, API is owner-only & anonymised)

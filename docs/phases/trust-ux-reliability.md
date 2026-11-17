# Trust, UX and reliability (2026-11-17)

## What's new

### Privacy policy and terms
- `/privacy` and `/terms`, linked from a footer on every app page and the rater form, and from sign-in.
- Content is a realistic draft. Placeholders in `[brackets]` live in `src/lib/legal.ts` (`LEGAL`, `PROCESSORS`);
  a "draft" banner shows until `LEGAL_DRAFT` is set to `false`. **Needs a lawyer's review before launch.**

### Delete your data, GitHub-style
- **Settings → Danger zone** (red section): delete all AI conversations, all goals and plans, all share links, or the
  whole account. Each action shows what will be removed and how many, and the button stays disabled until you type
  the confirmation phrase (`delete`, or your email for the account).
- **Delete a single 360**: bottom of a survey page and its report. Type the survey ID (e.g. `MRR-4K7Q`). Deleting the
  first session deletes the whole survey; deleting a later session removes only that session.
- **7-day grace period** for accounts: you're signed out at once, share links and API tokens are revoked at once, and
  signing in within 7 days cancels the deletion. The daily cron (`accounts` job) purges due accounts.

### Consistent buttons and fields
Sizes in `src/components/ui/button.tsx`:

| Size | Height | Use for |
|------|--------|---------|
| `default` | 40px (`h-10`) | Every form submit and primary action; matches inputs and selects |
| `sm` | 36px (`h-9`) | Row actions in lists and tables (Run again, Trends, Revoke) |
| `lg` | 44px | Hero / landing calls to action only |
| `icon` | 40px | Icon-only buttons next to inputs |
| `icon-sm` | 32px | Icon-only buttons inside list rows |

Rules: one size per row; don't override heights with `className`; native selects use `selectClass` from
`src/components/ui/field-classes.ts`; variants per row are either all `outline` or one `default` + `outline`
(no `secondary`/`ghost` mixed in). Badges never wrap.

### Reliability
- **Built-in error monitoring** (no third-party account): `src/instrumentation.ts` records server errors, the app error
  boundary reports client errors to `/api/client-error`, and cron jobs record their own failures. Errors are grouped by
  fingerprint, scrubbed of emails/tokens/DB URLs, and kept 90 days. View at `/admin/errors` (emails listed in
  `PLATFORM_ADMIN_EMAILS`).
- **Friendly error page** with "Try again" and "Go to my 360s".
- **Health check:** `GET /api/health` → `{ ok, version, checks: { database, ai, email, payments } }`, 503 if the DB is down.
  `GET /api/health?check=pdf` also renders a test PDF with Chromium (rate-limited to 3/hour). Point any free uptime
  monitor at `/api/health`.
- **Cron is resilient:** each job runs in its own try/catch, so one failure doesn't skip the rest; the route returns 500 if
  any job failed.

## Backup and restore runbook
- Neon project `mirror` (`super-tree-05741739`), free tier: point-in-time history of **6 hours**.
- To recover from a bad deploy or deletion within 6 hours: Neon console → Branches → `main` → Restore (or create a branch
  from a past timestamp, check it, then restore). Re-point `DATABASE_URL` only if you restore to a new branch.
- For longer protection, take a manual `pg_dump` before risky migrations, or upgrade Neon (longer history) — paid, ask first.

## Try it
1. Sign in as the demo user → Settings → scroll to **Danger zone** → "Delete all AI conversations" → type `delete`.
2. Open any survey → bottom of page → "Delete session N" → type the survey ID shown.
3. Visit `/privacy`, `/terms`, `/api/health`.

## Tests
- Unit: `tests/unit/monitoring.test.ts`. Integration: `tests/integration/trust.test.ts`.
- E2E: `tests/e2e/trust.spec.ts` (legal pages + axe, grace-period deletion and cancel, danger zone, delete session, health).

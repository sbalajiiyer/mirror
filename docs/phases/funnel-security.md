# Anonymous funnel counts and security basics (2026-11-19)

## Funnel (`/admin/funnel`, platform admins only)

- **Nothing new is tracked.** There are no cookies, page-view events, session recording or analytics. Every number is a count over data Mirror already keeps (accounts, 360s, invitations, plans, payments), plus one new timestamp: `Assessment.reportViewedAt`, when the subject first opened the report.
- **Steps for people asking for feedback**, counted over accounts created in the period: signed up → passed the age check → finished onboarding → started a 360 → rated themselves → sent invitations → got answers → got a report → opened the report → made a plan → came back (follow-up or pulse) → paid.
- **Steps for raters**, counted over invitations in surveys launched in the period: invited → started → answered, plus how many declined.
- **Periods:** 7, 30 or 90 days, or all time. Demo and test accounts (`*.mirror.local`, `example.com`, `test.local`, `t.local`) are left out unless you ask for them.
- **Only totals leave the server.** Counts under 5 show as "<5", and percentages and bars that involve them are hidden.
- **Code:** `src/lib/services/funnel.ts`. Tests: `tests/integration/funnel.test.ts` and `tests/e2e/security.spec.ts`.

## Security basics

- **`/security`**, public and linked in the footer, says only what is true today:
  - where data lives: Vercel iad1 and Neon AWS us-east-1; the EU option restricts AI only
  - encryption: TLS with HSTS, at rest by Neon, SSO secrets AES-256-GCM, tokens stored as hashes
  - sign-in without passwords, SSO with PKCE, roles, server-side checks and rate limits
  - the anonymity rules and privacy by design
  - logs: org audit log, personal activity log, scrubbed error monitor
  - retention and deletion
  - backups: Neon point-in-time restore of **6 hours** on the current plan, said plainly
  - the release process
  - breach notification within 72 hours
  - **no SOC 2, ISO 27001 or pen test yet**
  - the sub-processor list and how to report a vulnerability, with safe harbour
- **`/dpa`**: a data processing agreement template (GDPR Art. 28). The customer is the controller and Mirror the processor. It covers sub-processors (30 days' notice, right to object), EU SCCs (module 2) with the UK and Swiss add-ons, 72-hour breach notice, audits (questionnaire first, then once a year), and deletion within 30 days. Placeholders are in [brackets].
- **`/.well-known/security.txt`** (RFC 9116): `Contact`, plus an `Expires` date that always sits a year ahead.
- **Security headers on every response** (`next.config.ts`):
  - `X-Content-Type-Options: nosniff`
  - `X-Frame-Options: DENY` plus CSP `frame-ancestors 'none'; base-uri 'self'; object-src 'none'`
  - `Referrer-Policy: strict-origin-when-cross-origin`, and `no-referrer` on `/r/*` and `/s/*` because those paths carry tokens
  - `Permissions-Policy` turns off camera, microphone, geolocation and similar
  - `Cross-Origin-Opener-Policy: same-origin`
  - A full script CSP needs nonces for Next.js's inline scripts; that is listed as a follow-up.
- **Sub-processors:** the list now includes Anthropic and OpenAI, used only when someone picks a premium model.

## Owner to-dos

- Set `LEGAL.securityEmail`, then fill in the DPA placeholders. A lawyer should review the DPA.
- Longer backups: Neon Launch plan (paid, about 7 days of restore) or a scheduled `pg_dump` to storage.
- Later: a full CSP with nonces, a pen test, then SOC 2 once a company customer asks for it.

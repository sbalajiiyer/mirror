# Phase 8 — Analytics v2: demo script

**Built:**
- **Benchmarks:** a card on each report places every competency against anonymous norms on the built-in
  questionnaire: your career stage when 10+ people match, otherwise everyone (30+). It shows where the middle half
  falls, the median, your score, a band ("Top quarter" …) and an approximate percentile.
  - Contributing is on by default; you can opt out in **Settings → Data and API**.
  - Only percentiles are stored (`BenchmarkNorm`), rebuilt by the daily cron.
- **Dashboard builder** (`/dashboards`, for everyone — owner decision): dashboards over *My own feedback*, *My
  coaching clients* (coaches) or *Organization* (org admins). Widgets:

  | Dashboard | Widgets |
  |---|---|
  | My own feedback | latest scores, trend across sessions (pick a survey), goal progress, benchmarks, all sessions |
  | Coaching | clients, patterns across clients |
  | Organization | participation, org strengths and gaps, team profile, cohort comparison |

  Widgets can be added, moved and removed. Each widget calls the same service as the matching page, as the
  dashboard's owner, so every access check and privacy threshold still applies.
- **Ask your data:** a plain-English question is mapped to one catalog widget, by AI (`nl_query`, free model,
  30 a day) or by a keyword matcher offline. Answers never use free-form queries. You can then **Add to dashboard**.
- **Scheduled reports:** each dashboard can be emailed weekly (pick a day) or monthly (day 1–28) by the daily cron, at
  most once per period.
- **CSV export:** of any widget, with safe quoting and spreadsheet-formula guarding.
- **Read-only API:** personal tokens in Settings. Up to 10 per person; each token is shown once and only its hash is
  stored. 120 requests per minute per token. Endpoints:
  - `GET /api/v1/me`
  - `/api/v1/sessions`
  - `/api/v1/dashboards`
  - `/api/v1/dashboards/{id}`

## Setup

`npx prisma migrate deploy` (migration `phase8_analytics`), then `npm run db:seed`. The seed adds 14 anonymous
benchmark sample people, builds norms (32 people), and creates dashboards *My growth* (Alex) and *People overview*
(Morgan).

## Walkthrough (≈8 minutes)

1. **Benchmarks.** As the demo user, open the Pre-promotion report and scroll to **Benchmarks**. The norms come from
   people at your career stage (Senior, 24), with a band and approximate percentile per competency.
2. **Dashboards → My growth.** Four widgets: latest scores, trend (S1–S3), goal progress and benchmarks. Download any
   widget as CSV.
3. **Ask your data:** "Show all my sessions and their status" → *All sessions* → **Add to dashboard**.
4. **Email me this dashboard → Weekly → Friday → Save.**
5. **Settings → Data and API → Create token.** Then call the API:
   `curl -H "Authorization: Bearer <token>" https://<host>/api/v1/sessions`
6. **As the org admin → Dashboards → People overview:** participation, org strengths, Engineering's team profile and
   the leadership cohort's before vs after. Create a new organization dashboard and add *Team profile → Product*.

## Rules and defaults

- **Norms:**
  - Everyone needs at least 30 people; a career-stage or goal slice needs at least 10.
  - Each person counts once (their latest full 360 on the built-in questionnaire, on the 1–5 scale), and only if
    they haven't opted out.
  - Custom questionnaires aren't benchmarked.
  - Percentiles are interpolated between the stored p10, p25, p50, p75 and p90.
- **Dashboards** belong to one person and are never shared. There are up to 12 widgets per dashboard. Organization
  dashboards re-check admin rights on every view.
- **API** is read-only and covers your own data only. Errors are JSON with a 401, 404 or 429 status.

# Mirror — Product & Build Specification

Personal 360° feedback platform. This is the full product spec, not just an MVP. Build it in the phases listed at the end.

## Role and goal

You are a senior full-stack engineer, people-analytics expert and product designer. Build **Mirror**, a production-grade platform where **anyone** — professionals, job seekers, founders, students, freelancers, coaches' clients, teams — can run credible, anonymous 360° feedback on themselves, see rich visual reports, and get a personalized, AI-assisted development plan. Coaches and small organizations can run 360s for many clients or employees.

## Users and roles

- **Individual (subject):** runs their own 360s and pulse checks.
- **Rater:** gives feedback (no account needed; secure link).
- **Coach / consultant:** manages many clients, white-labels reports, adds their own frameworks and notes.
- **Organization admin:** runs 360s for teams, cohorts or leadership programs.
- **Platform admin:** content, frameworks, billing, trust & safety.

## Tech stack

- Next.js (App Router) + TypeScript, Tailwind, shadcn/ui.
- PostgreSQL (Neon or Supabase) with Prisma or Drizzle; pgvector for embeddings.
- Job queue for reminders and report generation (e.g. Inngest, Trigger.dev or BullMQ).
- Charts: Apache ECharts or Recharts, plus D3 for custom charts (radar, Johari window, gap charts).
- PDF report rendering (Playwright or React-PDF).
- Stripe for payments; LLM API for summaries and coaching (provider swappable); email and SMS for rater invites.
- Hosting: Vercel or Azure Container Apps.
- Prefer free tiers during development; document every paid service and its cost. Ask the owner before choosing any paid service.

## Multiple surveys and assessment types

A subject or coach can run many assessments in parallel or over time:

1. **Full 360** — self, manager, peers, direct reports, clients, others (custom groups).
2. **Pulse 360** — short (5–10 question) repeat check-ins every 1–3 months to track progress.
3. **Role-specific 360s** — leadership, people manager, individual contributor, sales, engineering, founder, student/teamwork, consultant/client-facing.
4. **Personal life 360** — optional, non-work version for friends and family (communication, reliability, listening), clearly separated from professional data.
5. **Team 360** — team rates itself and each member; team-level dynamics report.
6. **Interview and job-search 360** — mock-interview feedback from mentors and peers.
7. **Custom surveys** — coaches and orgs build their own competency models and question banks.

Question types: rating scales (1–5, 1–7, frequency, agreement), behaviour-anchored scales, "start / stop / continue," open text, ranking of strengths, forced choice, and "one word to describe" (for word clouds). Built-in **competency frameworks** (leadership, communication, execution, collaboration, strategic thinking, emotional intelligence, growth mindset) with versioning, plus coach-made frameworks.

## Running a 360

- Guided setup wizard: pick a goal (promotion, new role, leadership growth, career change), pick a framework (AI can recommend one), customize questions, add raters by group.
- Rater invites by email, SMS or shareable link; personalized invite message (AI can draft it); reminders with smart timing; rater progress tracker.
- **Anonymity safeguards:** minimum rater counts per group before results show (e.g. 3), manager shown separately only if the subject opts in, text de-identification (AI rewrites to remove identifying details if the rater chooses), no IP or timestamp exposure.
- Rater experience: mobile-first, under 10 minutes, save and resume, multi-language, accessible.
- Self-assessment is completed first and locked, so gaps between self and others are honest.

## Analytics and visualization (major focus)

Every report is interactive on the web and exportable as a polished PDF. Charts support filtering by rater group and time period, with drill-down to question level and comments.

**Individual report**
- Overall summary card: top 3 strengths, top 3 growth areas, biggest blind spot, hidden strength, one-paragraph AI summary.
- Radar/spider chart: competencies, with self vs. all others vs. each rater group overlaid.
- Self vs. others gap chart: diverging bars per competency (blind spots vs. hidden strengths).
- Johari window: open strengths, blind spots, hidden strengths, development areas.
- Rater-group heatmap: competencies × rater groups.
- Distribution charts: score spread per question (dot or box plots) showing rater agreement.
- Highest and lowest rated behaviours, ranked.
- Benchmark comparison: percentile vs. anonymized norms (role, seniority, industry, region) once enough data exists.
- Open-text analysis: AI-grouped themes with representative de-identified quotes, sentiment per theme, word cloud.
- Start / stop / continue board grouped by theme.

**Progress over time**
- Trend lines per competency across full 360s and pulses.
- Before/after radar comparing any two assessments.
- Goal tracker linked to pulse results.
- Streaks and consistency of check-ins.

**Coach dashboard**
- Client portfolio: status of every client's 360, response rates, upcoming sessions.
- Cross-client analytics (anonymized): common blind spots, competency distribution, improvement over time.
- Session-prep view: auto-generated briefing per client with suggested coaching questions.

**Organization and team analytics**
- Team radar and team heatmap (members × competencies), with privacy thresholds.
- Cohort comparison (before vs. after, cohort vs. cohort).
- Talent grid (9-box) from opted-in data.
- Network view of who gives feedback to whom (counts only).
- Org-level strengths and gaps; response-rate and participation dashboards.

**Custom analytics**
- Dashboard builder for coaches and org admins; natural-language questions; scheduled reports; CSV export and an API.

## Personalization

- **AI development plan:** for each growth area, 3–5 concrete actions, practice exercises, reading/video suggestions, 30-60-90-day milestones, people to ask for help — tailored to goal, role, seniority, industry and learning style.
- **AI coach chat:** questions about your report, role-play difficult conversations, weekly nudges. Answers cite the person's own data and avoid diagnoses or personality labels the person hasn't chosen.
- **Personalized pulses** built around the person's chosen goals.
- **Adaptive question selection** based on goal and role.
- Personal dashboard layout, reminder schedule, preferred feedback tone (direct vs. gentle) in AI summaries, language preference.
- Coaches: own branding, frameworks, report templates, action libraries and pricing.
- **Shareable outputs:** private by default; subject chooses what to share (e.g. "verified strengths" LinkedIn badge, one-page summary).

## Integrations

Google and Microsoft calendars, Slack and Teams, LinkedIn (share badge), HRIS for orgs (BambooHR, Workday, Rippling), Zoom, Stripe, Zapier, webhooks, public API.

## Privacy, ethics and security

Anonymity thresholds enforced in the database and API, not just the UI; subject owns their data; explicit consent for sharing; org admins cannot see individual results without consent; deletion and export on request; encryption; audit logs; GDPR/CCPA; no sale of data; AI never infers health or personality traits the user did not choose; clear notice that this is development feedback, not a performance or hiring tool unless an org configures it with consent.

## Monetization

- Individuals: free mini-360 (up to 5 raters, basic report); paid full report ($49–99) or yearly plan with unlimited pulses and AI coach.
- Coaches: monthly plans by active clients, white-label, per-report credits at wholesale price.
- Organizations: per-participant pricing, cohort packages, enterprise SSO.
- Marketplace (later): match individuals with vetted coaches; referral fee.

## Data model (minimum)

User, SubjectProfile, Coach, Organization, Team, Cohort, Framework, Competency, Question, Assessment, RaterGroup, RaterInvite, Response, Comment, Theme, Report, DevelopmentPlan, Goal, Action, Pulse, BenchmarkNorm, ShareLink, Badge, Subscription, Payment, Notification, Dashboard, Event (analytics), AIInteractionLog, AuditLog.

## Non-functional requirements

Rater form loads in under 1.5 s on mobile; reports generate in under 30 s; professional, on-brand PDFs; WCAG 2.2 AA; multi-language; automated tests (unit, integration, Playwright end-to-end); seed data with realistic demo subjects, coaches and teams; observability; feature flags.

## Build phases

1. **Foundation:** auth, subject onboarding, one framework, full 360 setup, rater invites, anonymous rater form, reminders.
2. **Report v1:** summary card, radar, gap chart, Johari window, heatmap, open-text themes, PDF export.
3. **AI layer:** summaries, development plan, de-identification, framework recommendation.
4. **Pulses and progress:** pulse surveys, trend lines, before/after views, goal tracker.
5. **Coach workspace:** client portfolio, white-label, custom frameworks, session prep, cross-client analytics.
6. **Teams and orgs:** team 360, cohort comparison, team heatmaps, 9-box, HRIS integration.
7. **Personalization v2:** AI coach chat, adaptive questions, personalized pulses, sharing and badges.
8. **Analytics v2:** benchmarks, dashboard builder, natural-language queries, scheduled reports.
9. **Payments and marketplace:** all plans, credits, coach marketplace.
10. **Enterprise and polish:** SSO, data residency, audit, mobile polish.

For each phase: list the files to create, the database migrations and the tests; build it; run the tests; write a short demo script in `docs/phases/`.

# Phase 7 — Personalization v2: demo script

**Built:**
- **AI coach chat** (`/chat`):
  - *Ask about your report*: answers grounded in your own anonymised scores and themes, goals and plan, with
    the facts used shown as citations.
  - *Role-play* a difficult conversation: four presets or your own situation. Type "feedback" or click **How am I
    doing?** for coaching.
  - Free model, 30 messages a day. Premium conversations cost 1 credit each when a premium model is configured and
    chosen in Settings (otherwise shown as "coming soon").
- **Adaptive question selection:** the 360 wizard's **Suggest for my goal and role** keeps every statement in the
  areas your goal depends on, plus leadership if you lead people, and two from each other area. It's shorter for
  students and early-career people, and explains why.
- **Personalized pulses:** suggested pulse statements now put your active goals first, then the growth areas linked
  to the goals you chose at onboarding.
- **Weekly nudges** (opt-in, off by default): pick a day in Settings and get one short email with a rotating action
  from your plan and your goals. One-click unsubscribe; nothing is sent if there is no goal or plan.
- **Sharing** (private by default; owner chose all three kinds). From a report, click **Share** and choose:
  - *Verified strengths badge*: public verify page with top strengths and rater count, **Add to LinkedIn profile**
    (LinkedIn's free add-certification link), **Post on LinkedIn**, and an embeddable `…/badge.svg`.
  - *One-page summary*: only the sections you pick (strengths, growth areas, chart, summary paragraph), printable
    or saved as PDF.
  - *Full report*: read-only, for a mentor or manager.

  Links are unguessable, revocable, can expire, and count views. Nothing public ever includes raters' comments.

## Setup

`npx prisma migrate deploy` (migration `phase7_personalization`). No new seed data is needed.

## Walkthrough (≈8 minutes)

1. Sign in as the demo user and open the Pre-promotion report.
2. **Ask the AI coach** → **Start** → ask "What should I work on first?". The reply cites your scores, for example
   "Communication: others 3.2, self 4.0".
3. **AI coach → Practise a difficult conversation → Ask your manager for a promotion.** Say your opening line,
   reply to the manager, then click **How am I doing?**.
4. **Share → Verified strengths badge → Create link.** Open it in a private window: you see your name, top strengths,
   "Based on 360° feedback from 12 people …" and a verification ID. **Add to LinkedIn profile** opens LinkedIn's
   add-certification form, pre-filled.
5. Create a **One-page summary** with Strengths and Growth areas, and open it. Revoke the badge; its link now says
   "This link isn't available".
6. **Settings → Weekly nudges → Every Monday.** The daily cron sends it on Mondays, at most once a week.
7. **New 360 → Questions → Suggest for my goal and role.** The suggestion trims the 28 statements and lists why.

## Rules and defaults

- **Chat context** is the person's own report aggregates (the same digest the AI summary uses), goal titles and plan
  focus areas. The guardrails forbid diagnoses, personality labels and guessing raters, and the coach suggests
  talking to someone trusted if distress comes up.
- **Limits:** a conversation holds at most 80 messages. Free: 30 messages a day. Premium: 200 a day, plus 1 credit
  per conversation.
- **Public share pages** are `noindex`, rate-limited per network (120 views per 10 minutes), and show only the frozen
  report data with comments removed.
- **Nudges** go out when the chosen weekday matches in UTC and none has been sent in the last 6 days. The unsubscribe
  link is signed and valid for 90 days; after that, use Settings.

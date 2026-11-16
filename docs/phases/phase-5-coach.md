# Phase 5 — Coach workspace: demo script

**Built:**
- **Coach workspace** (`/coach`):
  - client portfolio
  - session prep per client
  - read-only shared reports
  - private notes
  - coaching-session scheduling
  - cross-client analytics
  - profile and white-label branding
- **Client side** (`/coaching`):
  - accept or decline invitations
  - invite your own coach
  - choose exactly what each coach sees
  - see upcoming coaching sessions
  - stop at any time
- **Coach questionnaires:** questionnaires a coach builds under Questionnaires are offered to their active clients
  in the new-360 wizard ("From your coach …").
- **White-label:** the coach's brand name and colour appear as "Prepared with …" on the client's own report and PDF,
  if the client allows it.

## Setup

`npx prisma migrate deploy` (migration `phase5_coach`), then `npm run db:seed`. The seed adds:
- demo coach **Jordan Lee** (`coach@mirror.local`, brand "Lee Leadership Coaching")
- six clients: Alex plus five sample clients, each with two full 360s
- upcoming coaching sessions, a private note, and a pending invitation

The sign-in page has **Sign in as demo coach (Jordan)** next to the demo-user button (only when `DEMO_LOGIN_ENABLED=true`).

## Walkthrough (≈10 minutes)

1. **Portfolio.** Sign in as the demo coach. **Clients** lists six clients, each with:
   - number of surveys and active goals
   - current session status and response rate, or the latest session and score
   - next coaching session and next pulse due

   The pending invitation to new.client@example.com is listed under **Invite a client**.
2. **Session prep.** Open **Alex Morgan**. The brief covers:
   - strengths, growth areas and blind spot from S3 (Winter re-run)
   - change since the previous full session
   - goal progress (Raise communication)
   - questions to explore, from a coaching question bank for the focus areas

   **Write with AI** produces a short AI brief and tailored questions, using only the shared aggregates (free model,
   20 a day).
3. **Shared report.** Click **S3 · Full 360 · Winter re-run**. It's the full report, read-only, with no owner actions or
   AI summary. Alex doesn't share comments word for word, so the comment sections are replaced by a note (theme counts
   still show in the brief).
4. **Notes and sessions.** Add a private note; it is never shown to the client. Schedule a coaching session; the
   client sees it on their Coaching page.
5. **Analytics.** Shows common blind spots, most common growth areas, the competency distribution across clients
   (range and mean) and the average improvement from first to latest full 360. Every figure needs at least
   **5 clients**; below that the page explains it is locked.
6. **The client's side.** Sign out, then sign in as the demo user (Alex) → **Coaching**.
   - Jordan Lee is listed with sharing switches: reports on, comments off, goals on, plan off, branding on.
   - Open the Pre-promotion report: "Prepared with Lee Leadership Coaching" appears at the top.
   - Untick branding and save: it's gone.
   - **Invite your coach** emails an invitation, which shows in the dev outbox.
7. **Invitation by email.** As the coach, invite a new address.
   - In the dev outbox, open the coaching invitation link and sign in with that address (magic link).
   - Accept. A brand-new user finishes onboarding, and the coach's portfolio now lists them.
   - The invitation only works for the invited address, and the link can be used once.

## Rules and defaults

- **Consent first.** A coach sees nothing until the client accepts, or until the client invites them. Either side can
  end the link, and access stops at once. Only the client can change what is shared.
- **Sharing switches** (set per coach):
  - Reports and progress (default on)
  - Rater comments word for word (default off, and only possible with reports on)
  - Goals (default on)
  - Development plan (default off)
  - Show coach's branding (default on)

  Always visible: name, email, and 360 status and response counts.
- **Shared reports** are the frozen, anonymised report data. Raters' individual answers are never available to anyone.
  Every coach view of a report is written to the audit log (`coach.view_report`).
- **Cross-client analytics** use each client's latest full 360 and hide every figure backed by fewer than 5 clients.
- Coach accounts are free for now. Coach plans (by number of active clients) come with payments in Phase 9.

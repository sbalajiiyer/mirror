# Phase 4b — Survey IDs, sessions and "Run again": demo script

**Built (at the owner's request):**
- **Survey ID.** Each original 360 starts a *survey* with a short, stable ID, for example `MRR-7K3Q2X`. Pulses and
  re-runs belong to the same survey.
- **Sessions.** Each run of a survey is a numbered session: **S1, S2, S3…**. Each session has a type (Full 360 or Pulse
  check) and an editable name, for example "Baseline" or "Spring 2027".
- **Run again.** Re-runs the *identical* questionnaire (same statements, same order) with the same raters, who get new
  private links. Every statement can then be compared across sessions.
- **Trends and comparison.**
  - The Progress page labels check-ins S1/S2/S3.
  - A *Full sessions only* toggle compares full 360s on every statement.
  - **Compare sessions** lets you pick any two sessions by name.

## Setup

`npx prisma migrate deploy` (adds migration `survey_sessions` and numbers existing assessments), then `npm run db:seed`.
The demo survey "Pre-promotion 360 — Autumn 2026" now has three sessions:

| Session | Type | Name |
|---------|------|------|
| S1 | Full 360 | Baseline |
| S2 | Pulse check | 1-month check-in |
| S3 | Full 360 | Winter re-run (all 28 statements, with improvements) |

## Walkthrough (≈5 minutes)

1. **Dashboard.** Sign in as the demo user. Each survey is a card showing:
   - its ID badge
   - its goal and session count
   - one row per session: number, type, name, dates, responses and status

   The title opens the latest report.
2. **Report header.** Open S3's report. The header shows the survey ID and "Session 3 · Full 360 · Winter re-run".
   Click the pencil to rename the session; the new name appears everywhere.
3. **Progress.** Go to **Progress** (or **Trends** on the survey card).
   - The selector shows the survey ID.
   - Click **Full sessions only**: Leadership is now compared on all 4 statements, S1 → S3.
   - In **Compare sessions**, pick S1 and S3: every competency moved, and each row says how many statements it's based on.
4. **Run again.** On the survey card, click **Run again**.
   - The page says this will be session 4.
   - Name it (default: month and year), keep "same people", choose a due date.
   - Click **Create session & rate myself**. Rate yourself as usual. Raters get new links once you submit.
5. **One open session at a time.** While S4 is open, **Run again** and **Pulse check** are hidden on the card. The server
   also refuses them ("This survey already has a session in progress").

## Rules and defaults

- The survey ID is derived from the first session's id (a hash, so it is stable and not guessable). It isn't a secret;
  it's just a reference.
- Session numbers count up within a survey across both full re-runs and pulses.
- A re-run always copies the **first session's** questionnaire, even if started from a later report, so the series
  stays comparable. Want different questions? Start a new 360 instead.
- Raters who declined are not re-invited. Rater groups and anonymity rules carry over unchanged.

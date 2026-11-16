# Phase 6 — Teams and organizations: demo script

**Built:**
- **Organizations** (`/orgs`): anyone can start one for free. The creator is its first admin.
- **People:** invite by pasting a list ("Name <email>", "email, name" or just an email, one per line). Each person
  joins with their own account. Admins can change roles or remove people.
- **Teams and cohorts:** a team is people who work together; a cohort is, for example, a leadership programme
  intake. A person can be in several.
- **360 rounds:**
  - an admin starts a round for everyone, a team or a cohort, on one questionnaire
  - each person gets an email and sets up their own 360 from it (the questionnaire is fixed)
  - **Team 360** suggests teammates as raters for each other
- **Admin analytics:**
  - participation funnel per round
  - org strengths and gaps
  - team radar against the org
  - team dynamics: team vs self, and spread (how consistently people are seen)
  - people × competencies heatmap
  - cohort comparison: cohort vs cohort, or before vs after (same cohort, two rounds)
- **Talent grid (9-box):** only for people who opt in. The vertical axis is 360 behaviours; the horizontal axis is a
  performance rating an admin enters.
- **Member controls:**
  - share my reports with admins (off by default)
  - include me on the talent grid (off by default)
  - leave the organization

**Not built (owner decision):** HRIS integration. Admins can paste a list exported from any HR system instead.

## Setup

`npx prisma migrate deploy` (migration `phase6_orgs`), then `npm run db:seed`. The seed adds **Brightline Studio**:
- admin Morgan Blake (`admin@mirror.local`), Alex, and 12 employees
- teams Product and Engineering, and the cohort "Leadership programme 2026"
- two closed rounds (Spring and Autumn 2026) with a full 360 for every employee in each
- an open Product team 360 that Alex hasn't started yet

The sign-in page has **Sign in as demo org admin (Morgan)**.

## Walkthrough (≈10 minutes)

1. **Overview.** Sign in as the demo org admin and open Brightline Studio. You'll see member, team and cohort counts,
   org strengths and gaps, and a participation funnel for each of the three rounds.
2. **Analytics → Engineering.**
   - Radar against the org, plus team dynamics.
   - The heatmap shows Grace Kim and Isla Brown by name (they share their reports) and the other five as
     "Others (5)".
3. **Analytics → Product.** Ben and Dev share, but only three others don't, so naming them would leave a group under
   5. The heatmap shows only "Whole team (5)".
4. **Compare cohorts.** Pick Leadership programme 2026 · Spring 2026 360 against the same cohort · Autumn 2026 360. Each
   competency's change is shown, and the cohort improved more than everyone else.
5. **Talent grid.**
   - Only the five people who opted in are considered. Four have a performance rating; Jonas Berg shows as "Not placed".
   - Change a rating; the change is audit-logged.
6. **People → Grace Kim → Autumn 2026 360.** The report opens read-only, without raters' comments. For Felix Wong,
   who doesn't share, there is no report link, only a lock icon.
7. **As a member.** Sign in as the demo user (Alex).
   - The dashboard shows "Brightline Studio started Winter 2026 team 360".
   - **Set up my 360** opens the wizard with the questionnaire fixed and teammates suggested as raters.
   - On **Organizations → Brightline Studio**, Alex controls what the admins can see.
8. **Start your own.** On Organizations, create an org, invite people, add a team and start a 360 round.

## Rules and defaults

- **Only org rounds count.** Admins only ever see data from 360s started from their org's rounds; personal 360s never
  appear.
- **Aggregates.** Every group figure needs at least 5 people (`minGroupSize`, never below 5).
- **Heatmap names** only consenting people, and only when the rest are either none or at least 5. Otherwise the
  whole-team row is shown.
- **Individual reports** are visible to admins only if the person turns sharing on. Admins never see raters' comments
  word for word, and every admin report view is audit-logged.
- **Talent grid** is opt-in. Behaviour bands are thirds of the scale above 1: on 1–5, under 3.0, 3.0–3.99, and 4.0 or
  above. Performance is low, medium or high and entered by an admin. It is labelled as a development tool and never
  shown to raters.
- **Last admin:** an org always keeps at least one admin (they can't leave or be demoted).
- **Leaving** turns off all sharing and removes the person from teams and cohorts. Their reports stay theirs.
- **Pricing:** free until payments (Phase 9), which will be per-participant pricing.

# Rater anonymity hardening (2026-11-18)

Problem: the person asking for feedback could see each rater's status ("Responded", "In progress", "Declined") as it changed. Combined with a small group, written comments could point to a person.

Owner decisions: do all six fixes, and **no manager exception**. This is development feedback, not a formal review.

| # | Rule | Where |
|---|---|---|
| 1 | **Counts, never who.** The subject sees "3 of 6 responded" and per-group counts only for groups with at least `min + 2` invites. Other groups say "counted with other groups". Raters are listed as "Invited" or "Not sent yet" only. No reminder counts per person. Raters can't be removed after launch, because a refusal would show they had answered. | `assessments/[id]/page.tsx`, `services/assessments.ts` |
| 1 | **Status-blind reminders.** One message, "Remind everyone who hasn't answered". The server picks the recipients. The result, history and errors never name or count anyone. One manual round every 48 hours per 360; the per-person rules still apply (max 3, 2 days apart, working hours). Queued rounds can be cancelled as a whole. Personal lines stay per person. | `services/reminders.ts`, `components/assessment/reminders-panel.tsx` |
| 2 | **More invites than answers.** Launching needs at least `min + 2` named invites (5 by default), unless a group has a share link. In reports, a group is shown on its own only with at least `min + 2` invites; a pool of small groups stands alone only on the same terms. | `lib/anonymity.ts` (`INVITE_MARGIN`, `minInvites`), `launchAssessment` |
| 3 | **Comment authors.** A reporting group's comments are quoted only if at least `min` different people in it wrote comments. Otherwise they count towards themes (`withheld`) but are never shown word for word or used in the word cloud. The report notes this. AI scrubbing is already on by default for raters. | `lib/report/compute.ts`, `lib/text/themes.ts` |
| 4 | **No manager exception.** Managers are pooled like everyone else. The wizard toggle, rater-form warning and report note are removed. The migration switches open 360s off the old setting; closed reports keep what raters were told when they answered. | `lib/anonymity.ts`, migration `20261119150000_no_manager_exception` |
| 5 | **Raters are told** before they start, in 5 languages: "{name} sees how many people answered, never who answered or what any one person said…". Also stated in the wizard and on the 360 page. | `lib/i18n/rater.ts`, `r/[token]/rater-form.tsx` |
| 6 | **Company admins and coaches** already see only totals (done/total per 360) and never rater names or statuses. Confirmed in `services/org.ts`, `services/coach.ts` and `org/analytics.ts`; nothing to change. | n/a |

## Tests

- **Unit:**
  - invite margin and pooling
  - no manager exception
  - comment-author rule with `withheld` counts
- **Integration** (`reminders.test.ts`):
  - reminders reach non-responders only
  - the panel holds no status
  - one round every 48 hours
  - a queued round can be cancelled and is then sent
  - nobody gets more than 3 reminders
  - no removal after launch
- **Integration** (`phase4`): a pulse with 4 reused raters must add one before sending.
- **E2E:**
  - the rater flow shows "3 of 5 responded" and never "Responded"
  - the reminder screen shows no status anywhere
  - the report has no column under 3

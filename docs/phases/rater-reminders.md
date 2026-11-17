# Rater invitations and reminders (2026-11-17)

## Who sends rater emails
Mirror sends every rater email on behalf of the person asking for feedback:
- **From:** "<their name> via Mirror" (the address is Mirror's `EMAIL_FROM`).
- **Reply-To:** the person's own email, so replies reach them.
- Invitations, automatic reminders, reminders sent from the panel, and company round reminders.

**Until an email provider is connected** (`EMAIL_PROVIDER`, see STATUS "Still open"), emails go to
the dev outbox (`/dev/outbox`), not real inboxes. Providers just need to use `fromName` and
`replyTo` on `EmailMessage`.

## Remind raters from one screen (360 page → "Remind raters")
1. **Pick people:** filters (Can be reminded, Not started, Started but not finished, Everyone),
   select all shown, clear. People who can't be reminded are greyed out with the reason
   (responded, declined, no email, reminded recently until <time>, 3 reminders already, queued).
2. **Personal line per rater:** saved on the invitation; added to their invitation (if not sent
   yet) and every reminder.
3. **Message:** three tones (warm, brief, formal) as starting points; fill-ins `{first name}`,
   `{your name}`, `{due date}`, `{due line}`; "Rewrite with AI" in plain language that keeps the
   fill-ins (falls back to your text if it drops one); "Save this message for my next 360s".
4. **Preview** exactly as one selected person will get it, including sender and subject.
5. **Send.** Outside working hours the reminder is **queued** and goes out at the next sending
   window (shown before you send); you can cancel a queued reminder.
6. **History:** every reminder, automatic or by you, sent, queued or skipped with the reason.

## Rules (shared with the automatic reminders)
`src/lib/reminders/rules.ts`, enforced on the server:
- At most **3 reminders per rater**, at least **2 days apart**, automatic and manual together.
- Only **weekdays 09:00–17:00 UTC**; otherwise queued.
- Never to people who responded or declined, or once the 360 isn't collecting.
- Queued reminders are sent by the daily job before automatic ones, and the same rater never gets
  both in one run.

## Company rounds (Company → 360 rounds → "Who hasn't started")
Admins see who hasn't set up their round 360 and remind them (3 max, 2 days apart). They never see
or contact raters: each person reminds their own raters, so raters stay anonymous.

## Tests
`tests/unit/reminder-rules.test.ts`, `tests/integration/reminders.test.ts`,
`tests/e2e/reminders.spec.ts`.

# Compliance checks (2026-11-17)

The owner asked for a check of six items. What was found and done:

| Item | Before | Now |
|---|---|---|
| **Age gate** | The terms said 16+, but nothing checked it. | New accounts (email link, SSO, coach invitation) see `/welcome` first. It asks a neutral question: birth month and year, with no hint of the minimum age. The answer is not stored. People under `LEGAL.minimumAge` (16) have their account and email deleted at once. A cookie stops a retry from that browser for a year. Passing records `ageConfirmedAt` and `termsAcceptedAt` (the terms checkbox). Existing users see the check once on their next visit. `requireUserId` enforces it everywhere. |
| **Externally loaded fonts** | None. Geist is bundled by the `geist` package (`next/font/local`) and served by Mirror. No Google Fonts or other CDN. | No change. The privacy policy now says so. |
| **Session replay without consent** | None. No Hotjar, FullStory, PostHog, LogRocket, Clarity or analytics. The built-in error monitor records only scrubbed error messages. | No change. The privacy policy now says "no analytics, and no session recording or replay". |
| **Emails without unsubscribe and address** | Only the weekly nudges had an opt-out. No email had a postal address. | Every email except sign-in links and email confirmations now gets: our postal address (`MAIL_POSTAL_ADDRESS`), an unsubscribe link (`/u/<signed token>`, which only changes anything when its button is pressed), and `List-Unsubscribe` plus `List-Unsubscribe-Post` headers (RFC 8058 one-click, `POST /api/unsubscribe`). This covers rater invitations, reminders, nudges, reports, coach and org invitations, and round emails. Unsubscribed addresses go in `EmailSuppression`, and `sendEmail` skips them (status `SUPPRESSED`). |
| **Renewal terms beside the subscribe button** | Plans are bought one period at a time and never renew. The page still said "Renews …" with a "Cancel renewal" button. | Every buy button now has its terms right under it, from `purchaseTerms()`. The checkout page shows them too. For example: "$29.00 for 30 days, paid once. It doesn't renew automatically and you won't be charged again…". Credits are "one-time, don't expire". The page now says "Paid until …"; the misleading cancel button is gone. The terms are updated to match. If automatic renewal is added later, change `purchaseTerms()` first and get consent at the button. |
| **DMCA agent** | None. | A new `/copyright` page, linked in every page footer and from the terms. It names the designated agent (`LEGAL.dmcaAgent`), what a notice must include, the counter-notice process and the repeat-infringer policy. |

Migration `20261119120000_compliance` (additive):

- `User.ageConfirmedAt`, `User.termsAcceptedAt` and `User.ageBlockedAt`
- the `EmailSuppression` table
- the `SUPPRESSED` notification status

## The owner still needs to

1. **Register a DMCA designated agent** with the U.S. Copyright Office (online, $6, renew every 3 years). Then fill in `LEGAL.dmcaAgent` in `src/lib/legal.ts` with the same name, address, email and phone.
2. **Set `MAIL_POSTAL_ADDRESS`** in Vercel to a real postal address (a P.O. box or commercial mailbox is fine). Also fill in `LEGAL.company` and `LEGAL.address`.
3. **Confirm the minimum age.** It is 16 now: GDPR needs parental consent below 13–16 depending on the country, and COPPA applies under 13. Change `LEGAL.minimumAge` to raise it, for example to 18 for a workplace-only product.
4. **Raters** answer through a link without an account, so they get no age check. That is reasonable because people invite colleagues and contacts, but it's the owner's call.
5. **Email provider:** when one is connected (Resend suggested), it must pass `message.headers` through so the one-click unsubscribe works in Gmail and Yahoo. Their bulk-sender rules require it.
6. **Legal review** of the privacy policy, terms and copyright page; they are still marked as drafts.

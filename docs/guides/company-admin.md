# Mirror for companies — admin guide

This guide is for the people who run Mirror for a company: **owners** and **admins**.

## Workspaces in one minute
- Everyone has a **Personal** space. It's private and stays theirs.
- Your company has its own **workspace**. Switch between them with the menu at the top left.
- Anything made inside the company workspace (round 360s, company dashboards, AI chats about round
  reports) belongs there and follows the company's rules.

## Roles
| Role | Can do |
|------|--------|
| **Owner** | Everything: sign-in (SSO), data region and retention, AI models and budgets, billing, roles. A company always has at least one owner. |
| **Admin** | Invite and remove people, teams and cohorts, 360 rounds, talent grid, coaching offers, audit log. Can't remove an owner. |
| **Analyst** | Read-only: overview, analytics and company dashboards. |
| **Member** | Takes part in rounds and sees their own reports. |

Owners change roles on **Company → People**.

## What the company sees, and what it doesn't
- **Group results** only, and only for groups of at least your minimum size (never below 5).
- An **individual report** only if that person chooses to share it.
- **Coaching:** who is coached by whom and the status. Never what is shared or discussed.
- **Round results are frozen** as each 360 closes. If someone leaves, the company keeps the
  anonymous totals; their individual report stays theirs.

## When someone leaves
1. Remove them on **People**, or they leave themselves.
2. For 7 days they can copy their own reports to their Personal space, unless you switch this off in
   **Company settings → Data** (copies never include raters' written comments).
3. After 7 days their data in the company workspace is deleted. Rejoining within 7 days keeps it.
4. Any coaching the company paid for ends.

Tip: ask people to add a **personal sign-in email** (Settings) so they can still reach their
Personal space if your company requires its own sign-in.

## Billing (owners)
**Company → Billing**
- **Company plan:** monthly. New companies get a 30-day free trial. Without an active plan you can
  still see results, but not start new rounds.
- **Seats:** each person in a 360 round uses one seat.

## AI (owners)
**Company settings → AI models**
- The free model is always available. Turn on the premium models people may use here.
- Set a **monthly budget** for everyone and **per person**. When a budget is used up, people get the
  free model until next month. Nothing is ever charged to employees.
- See this month's premium-AI spend per person.

## Coaching paid by the company (admins)
**Company → Coaching:** offer a coach to a person by email. They accept or decline; only then is the
coach invited. The person controls what the coach sees. You can end it at any time.

## Data settings (owners)
**Company settings → Data**
- **Data region:** US or EU. EU companies never send round data to a non-EU AI provider.
- **Retention:** raw rater answers are deleted 12, 24 or 36 months after a 360 closes. The same period
  also removes old AI chats and development plans in the company workspace.
- **Single sign-on:** verify your domain with a DNS record, connect your identity provider, and
  optionally require SSO for everyone on that domain.

## Audit
**Company → Audit log** lists every sensitive change (settings, roles, SSO, retention, exits) with
filters and CSV export.

# Phase 11 plan — Personal and company workspaces

_Status: **approved** (2026-11-17), decisions in §12. Built in steps 11a–11f._

## 1. Goal

Separate personal use and company use cleanly, inside one app and one codebase.

- Every person has one **Personal** space. It is private and paid for by the person.
- Every company is a **company workspace**. It is governed and paid for by the company.
- Every piece of data belongs to exactly one workspace. Company rules (sign-in, AI, data region,
  retention, audit) apply to everything in that workspace and nothing outside it.
- The promise in the privacy policy stays true: **an individual report belongs to the person.**

Out of scope for this phase: a separate deployment per customer, SCIM user provisioning, SAML.
These are listed in §11 as later steps.

## 2. What is wrong today

| # | Problem | Where it shows |
|---|---------|----------------|
| 1 | A company round creates an ordinary personal 360 (`Assessment.subjectId`, with an optional `orgCampaignId`). If the employee deletes their account, the 360 is deleted (`onDelete: Cascade`), and the company's past round results change, because group analytics are computed live from these 360s. | `src/lib/services/org.ts`, `src/lib/org/analytics.ts` |
| 2 | Work and personal features share one menu: the coach marketplace, personal billing and AI credit purchases appear next to company rounds. | `src/components/app-header.tsx` |
| 3 | Company seats and personal plans are not connected. It is unclear who pays for AI used on a company 360. | `src/lib/billing/*` |
| 4 | Company rules reach only round data. A company cannot limit AI models, and questionnaires, dashboards and chats made for work are not under its retention or audit rules. | `Organization` model |
| 5 | When a company requires SSO for its email domain, a person cannot keep a personal space under their work email. | `src/lib/sso/*`, `src/auth.ts` |
| 6 | Only two roles (`ADMIN`, `MEMBER`). | `OrgRole` |

## 3. Concepts

| Term | Meaning |
|------|---------|
| **Workspace** | A container for data. Kind is `PERSONAL` or `COMPANY`. |
| **Personal workspace** | Created automatically for every user. Exactly one member: the owner. Cannot be shared or deleted on its own (it goes with the account). |
| **Company workspace** | What `Organization` is today. Many members, with roles. |
| **Active workspace** | The workspace the user is working in now. Stored in the session; changed with the switcher. |
| **Individual report** | One person's 360 report. Owned by that person, in every workspace. |
| **Group results** | Anonymous aggregates across people (team radar, heatmap, cohort comparison). Owned by the company. |

## 4. Data model

### 4.1 New and changed tables

```prisma
enum WorkspaceKind { PERSONAL COMPANY }

model Workspace {
  id        String        @id @default(cuid())
  kind      WorkspaceKind
  // PERSONAL: the owner. COMPANY: null (see Organization).
  ownerId   String?       @unique
  // COMPANY: 1:1 with Organization (keeps all existing org code and URLs working).
  orgId     String?       @unique
  createdAt DateTime      @default(now())
}
```

- **Keep `Organization`.** It becomes the company workspace's settings record (SSO, region,
  retention, seats). `Workspace.orgId` links them. This avoids renaming every org table and route.
- **Add `workspaceId` (required, indexed) to every user-content table:**
  `Assessment`, `Framework` (custom questionnaires), `DevelopmentPlan`, `Goal`, `CoachChat`,
  `Dashboard`, `ShareLink`, `ApiToken`, `AIInteractionLog`, `CreditLedger`.
- **Stays per person (no workspace):** `User`, `SubjectProfile`, `Account`, `Session`,
  `CoachProfile`, coach tables (coaching is a personal-space feature in this phase), `AuditLog`
  (gets an optional `workspaceId` for filtering).
- **Billing:** `Subscription`, `Payment`, `Entitlement` get a `workspaceId`. Personal plans attach to
  the personal workspace; seats and AI budget attach to the company workspace.
- **New: `RoundResult`** — a frozen, anonymous aggregate per round and group, written when a round
  closes (see §5.2). Holds only numbers that already pass the minimum group size.
- **New company policy fields on `Organization`:** `allowedAiModels String[]`,
  `allowPersonalCopy Boolean @default(true)`, `allowMarketplace Boolean @default(false)`.
- **Roles:** `OrgRole` becomes `OWNER | ADMIN | ANALYST | MEMBER` (see §7).

### 4.2 Data move (one migration plus a backfill script)

1. Create a `PERSONAL` workspace for every user.
2. Create a `COMPANY` workspace for every organization.
3. Set `workspaceId`:
   - an `Assessment` with an `orgCampaignId` goes to that company's workspace;
   - everything else goes to the owner's personal workspace;
   - plans, goals, chats and share links follow their 360's workspace;
   - dashboards follow their current scope (personal, coach or org).
4. Write `RoundResult` rows for every round that is already closed.
5. Make `workspaceId` required only after the backfill has been checked.

The backfill is idempotent and runs first on a **Neon branch copy** of production, with row
counts compared before and after. Neon's 6-hour restore window covers the real run. Take a
`pg_dump` immediately before it.

## 5. Ownership and lifecycle rules

### 5.1 Who owns what

| Data | Personal workspace | Company workspace |
|------|--------------------|-------------------|
| Individual 360 report | The person | The person (the company sees it only if the person shares it, as today) |
| Raw rater answers | The person | The person; deleted on the company's retention schedule |
| Group results (team radar, heatmap, cohort) | — | The company, as frozen `RoundResult` snapshots |
| Questionnaires | The person | The company (shared with all members) |
| Dashboards | The person | The company |
| Plans, goals, AI coach chats | The person | The person, but stored in the company workspace and covered by its retention and AI rules |

### 5.2 When someone leaves the company

- The admin removes the member, or the member leaves.
- If `allowPersonalCopy` is on, the person is offered **"Copy my reports to Personal"**. It copies
  their own 360s (scores, themes and their AI summaries; no raw comments) into their personal
  workspace. Raw rater comments stay under the company's retention rules.
- Their company-workspace data is then deleted, after the same 7-day grace period as account
  deletion.
- **The company's group results do not change**, because they come from `RoundResult` snapshots,
  not live from individual 360s.

### 5.3 When someone deletes their account

All workspaces they own are deleted (personal, plus their own data in company workspaces), after
the existing 7-day grace period. `RoundResult` snapshots stay: they are anonymous and already met
the minimum group size when they were written.

The privacy policy section "How long we keep it" needs one new line describing this.

## 6. Navigation and screens

- **Workspace switcher** in the header (and in the mobile menu): "Personal" plus each company,
  with the company name and logo initial. The current choice is remembered per user.
- **Menu by workspace:**

| Personal | Company (member) | Company (admin/analyst) |
|----------|------------------|--------------------------|
| My 360s, Progress, Questionnaires, Dashboards, AI coach, Coaching / Marketplace, Billing, Settings | My rounds, Progress, AI coach, Settings | + People, Rounds, Analytics, Talent grid, Audit, Company settings, Billing (seats) |

- **URLs:** company pages keep `/orgs/[orgId]/…`. Personal pages keep their current URLs. Shared
  pages (e.g. `/assessments/[id]`) check that the item's workspace is one the user belongs to, and
  switch the active workspace to it.
- **Landing after sign-in:** company SSO sign-in → that company's workspace; magic link → Personal
  (or the last workspace used).
- The coach marketplace and personal purchases are hidden in company workspaces unless the
  company turns on `allowMarketplace`.

## 7. Roles and permissions

| Role | Can do |
|------|--------|
| **Owner** | Everything, including SSO, data region, retention, deleting the workspace and billing. At least one per company. |
| **Admin** | Manage people, groups and rounds; see group results; see individual reports only if shared. |
| **Analyst** | Read-only group results and dashboards. No people management. |
| **Member** | Take part in rounds, see their own reports. |

All checks are on the server, in one helper, `requireWorkspaceRole(workspaceId, role)`, used by
every page, server action and API route. A test lists every route and asserts that it calls it.

## 8. Billing

- **Personal:** plans, Full 360 and AI credits, as today, attached to the personal workspace.
- **Company:** a monthly **platform fee** plus seats, and a monthly **AI budget** set by the owner,
  split into **per-employee budgets**. AI used in the company workspace is charged to the company
  and counted against the employee's budget; it is never charged to the employee.
- Company members never see personal upgrade prompts inside the company workspace.
- Premium AI in a company workspace is available only if the model is in `allowedAiModels`.

## 9. Company rules (policies)

Applied to everything in the company workspace, through the existing `runAI`, retention job and
audit log:

- **Sign-in:** SSO required for the domain (as today). New: the person can still have a
  personal workspace, reached by signing in with a personal email; accounts can be linked in
  Settings. Requiring SSO for work email no longer blocks personal use.
- **AI:** allowed models; data region (EU orgs never use non-EU AI, as today); monthly budget.
- **Retention:** the existing 12/24/36-month setting now also covers chats, plans and goals in the
  workspace.
- **Audit:** every company-workspace action is in the company audit log and its CSV export.

## 10. Delivery plan

Each step is its own PR, tested and deployed before the next.

| Step | Work | Tests |
|------|------|-------|
| **11a — Model and data move** | `Workspace` table, `workspaceId` everywhere, backfill script, `RoundResult` snapshots on round close and for past rounds. No visible change. | Backfill on a seeded DB: every row has a workspace; counts match; idempotent re-run. Group results equal before and after. |
| **11b — Access checks** | `requireWorkspaceRole`, active workspace in the session, all queries scoped by workspace. | Integration: a user cannot read another workspace's 360, dashboard, chat or share link by ID. Route inventory test. |
| **11c — Switcher and menus** | Header switcher, menu by workspace and role, landing rules, hide marketplace and personal billing in company workspaces. | E2E: switch workspaces; menus match the table in §6; axe passes in both. |
| **11d — Leaving and deleting** | Remove member → copy-to-personal offer → grace period → purge. Group results unchanged. | E2E: leave a company, copy reports, check personal copy and unchanged company analytics. |
| **11e — Roles, billing, policies, coaching** | Owner/Analyst roles; platform fee plus seats; company AI budget with per-employee budgets; allowed models; retention for all company data; linked personal email; company-paid coaches. | Unit and integration for each rule; E2E for an analyst's read-only view. |
| **11f — Docs** | STATUS.md, privacy policy line, admin guide, demo script, tech page. | — |

**Effort estimate:** similar to Phase 10. Step 11a carries most of the risk.

## 11. Later (not in this phase)

- **SCIM** automatic user provisioning and removal (Okta, Entra ID).
- **SAML** sign-in (BoxyHQ/Jackson, open source).
- **EU database** for EU companies (second Neon project in an EU region, per-workspace routing).
- **Dedicated deployment** for a large customer (same code, own Vercel project and database).

## 12. Owner decisions (2026-11-17)

1. **Copy to Personal on leaving:** on by default; the company can switch it off.
2. **Raw rater comments in the personal copy:** left out. The copy has scores, themes and AI summaries.
3. **Company AI:** the company pays from a monthly AI budget, **tracked per employee**: the owner sets
   a company budget and a per-employee monthly budget; use beyond either is refused, not charged to
   the employee.
4. **Coaching:** both. Personal coaching stays as it is, and companies can also pay for coaches for
   their people in this phase (step 11e): the company invites or picks a coach, assigns employees,
   and the coach sees only what each employee chooses to share, as today.
5. **Company pricing:** both seats and a monthly platform fee. Default fee in `catalog.ts`
   (placeholder, change freely); payments stay stubbed until Stripe is switched on.

## Build log

### 11a — Model and data move (2026-11-17)
- `Workspace` table (PERSONAL / COMPANY) and a required `workspaceId` on 360s, plans, goals, AI chats,
  dashboards, share links, API tokens, credits, subscriptions, payments and entitlements (optional on
  questionnaires, where built-ins have none, and on AI logs, where rater-side calls have no account).
- **The database assigns workspaces.** New users and organizations get theirs from an `AFTER INSERT`
  trigger; content rows get one from a `BEFORE INSERT` trigger when the app doesn't pass it (round
  360s → the company; plans, goals and share links → their 360's workspace; everything else →
  Personal). Existing code keeps working unchanged; 11b starts passing workspaces explicitly.
- **Frozen round results:** `RoundResult` keeps anonymous running totals (counts and sums only) per
  round, for the whole round and per team. A round 360 adds to them once when it closes
  (`contributeToRound`, called from `buildAndStoreReport`). They are never reduced. A backfill runs
  on every deploy (`scripts/backfill-round-results.ts`) and in the daily cron; both are idempotent.
- Nothing visible changes yet: analytics still read live reports until 11d.
- **Rehearsed on a Neon branch copy of production** (`rehearse-11a-workspaces`): 35 users → 35
  Personal workspaces, 1 company workspace, 24 of 52 360s in the company, 0 mismatches.
- Tests: `tests/unit/round-totals.test.ts` (frozen totals give exactly the live group profile),
  `tests/integration/workspaces.test.ts` (assignment rules, explicit workspace kept, totals match,
  idempotent, unchanged after an account is deleted, personal 360s never count).

### 11b + 11c — Access checks, switcher and menus (2026-11-17)
Built together: the switcher is only safe because of the checks.
- `src/lib/workspace.ts`: `listWorkspaces` (Personal first, then active company memberships with
  role), `activeWorkspace` (cookie `mirror-ws` = `personal` or `org:<id>`, re-validated against
  memberships on every read, so a forged value falls back to Personal), `requireWorkspaceRole`,
  `setActiveWorkspace`.
- **Header switcher** on every page, with "Companies…" to create or join one. Opening any
  `/orgs/<id>` page makes that company active.
- **Menus by workspace** (`src/lib/workspace-nav.ts`): Personal keeps everything; company members
  get My rounds, Progress, AI coach, Settings; admins also get Company and Dashboards. No billing,
  questionnaires or coaching marketplace in a company workspace.
- **Lists follow the active workspace:** My 360s / My rounds, Progress, AI coach (reports and
  chats) and Dashboards. "New 360" only in Personal; round invitations show in their company (and
  as a reminder in Personal).
- **Route inventory test** (`tests/unit/route-inventory.test.ts`): every page, API route and server
  action must check the caller or be on a reasoned public list.
- Tests: `workspace-nav`, `route-inventory` (unit); access and cookie rules (integration);
  `tests/e2e/workspaces.spec.ts`.

### 11d — Leaving and deleting (2026-11-17)
- Leaving or being removed sets `OrgMember.exitedAt` and `exitPurgeAt` (+7 days). Rejoining in that
  time cancels it; a re-invite keeps the link to the person's data until then.
- **Copy to Personal** (banner on the Personal dashboard, once): closed round reports are copied
  with `copiedFrom` set, sessions kept together, scores, themes and AI summaries kept, and **all
  written comments removed** (`withoutComments`: theme/SSC comment lists, competency comments and
  the word cloud). Copies can't be run again or get pulse checks. Companies can switch copying off
  (Company settings → Data, `allowPersonalCopy`).
- Daily cron `companyExits` deletes the leaver's company-workspace 360s (plans, goals, share links
  cascade) and AI chats after the grace period.
- **Analytics for a chosen round now read the frozen totals** (team view, cohort comparison), so
  they don't change when people leave. Views without a round still show current members' latest
  results; the named heatmap always uses current members.
- Privacy policy: new line on what happens when you leave a company.
- People who left before this change keep their old data (no exit was recorded for them).
- Tests: leaving, copy without comments, company switch-off, purge after grace with unchanged round
  analytics and comparisons, rejoining (integration); company setting (e2e).

### 11e (part 1) — Roles, company AI models, retention (2026-11-17)
- **Roles:** `OrgRole` is now OWNER > ADMIN > ANALYST > MEMBER (`src/lib/org/roles.ts`). Migrations
  add the values and make each company's creator (or longest-standing admin) its Owner.
  - Owner: sign-in (SSO), data region and retention, AI models, seats, roles.
  - Admin: people, teams, rounds, talent grid, audit log; can't remove an owner.
  - Analyst: read-only overview, analytics and company dashboards.
  - A company always keeps at least one owner; only owners change roles (role menu on People).
  - Company tabs are filtered by role; `adminPage(orgId, path, min)` guards each page.
- **Company AI models:** owners choose which premium models are allowed (Company settings → AI
  models). In a company workspace, a premium choice that isn't allowed falls back to the free
  model. AI calls know their workspace via `withAiWorkspace` (request context; passed explicitly for
  streamed chat), and `AIInteractionLog.workspaceId` records it, which the AI budgets in part 2 use.
- **Retention** now also deletes AI chats and development plans in the company workspace once
  untouched for the retention period (Personal is never affected).
- Tests: roles (unit + integration), AI model rules and usage attribution, retention (integration),
  owner screens (e2e).

### 11e (part 2) — Company plan, seats and AI budgets (2026-11-17)
- **Company plan:** monthly platform fee (`company_platform_month`, placeholder $49 in
  `catalog.ts`) plus seats. New companies get a 30-day free trial; existing companies got 30 days
  from this change. Starting a new round needs an active plan; results stay readable when it ends.
- **Company billing page** (`/orgs/<id>/billing`, owners): plan status, renew, seats, company
  payments. The personal Billing page links to it; company purchases return there.
- **AI budgets:** owners set a monthly premium-AI budget for everyone and per person (Company
  settings → AI models). When either is used up, people get the free model until next month;
  nothing is charged to employees. Owners see this month's spend per person.
- **Company-paid premium chats:** premium AI coach chats started in a company workspace use the
  company budget instead of the person's own credits.
- Tests: plan rules (unit); plan gating, payment fulfilment, budget fallback per person and
  overall, per-person usage, credit-free company chats (integration); company billing (e2e).

### 11e (part 3) — Company-paid coaching and personal sign-in email (2026-11-17)
- **Company coaching** (Company → Coaching, admins): an admin offers a coach (by email) to an
  employee. The employee accepts or declines on their Coaching page; only then is the coach
  invited, through the normal coach invitation. The coach sees only what the employee shares
  (written comments off by default). The company sees who is coached, by whom, and the status, never
  content. Company-paid clients don't count against the coach's own plan. Admins can end it;
  leaving the company ends it.
- **Personal sign-in email** (Settings): add a personal address, confirm it from that inbox while
  signed in (the confirm page needs a click, so link scanners can't confirm it). An email link to
  it then signs in to the same account, even if the work email's company requires SSO. Addresses on
  an SSO-required company domain, or used by another account, are refused.
- Tests: offer → employee accepts → coach accepts; decline; status-only admin view; plan limit
  unaffected; ends on leaving; personal email rules (integration); sign-in via personal email and
  offering coaching (e2e).

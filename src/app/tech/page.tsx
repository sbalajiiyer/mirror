import { cookies } from "next/headers";
import { validTechPass, TECH_COOKIE, techGateConfigured } from "@/lib/tech-gate";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { lockTech, unlockTech } from "./actions";

export const dynamic = "force-dynamic";

const ERRORS: Record<string, string> = {
  wrong: "That password isn't right.",
  rate: "Too many attempts. Please wait a few minutes.",
  off: "This page isn't available.",
};

export default async function TechPage({ searchParams }: { searchParams: Promise<{ e?: string }> }) {
  const unlocked = validTechPass((await cookies()).get(TECH_COOKIE)?.value);
  if (!unlocked) {
    const e = (await searchParams).e;
    return (
      <Card className="mx-auto mt-10 max-w-sm">
        <CardHeader>
          <CardTitle className="text-xl">Private page</CardTitle>
          <CardDescription>Enter the password to read how Mirror works.</CardDescription>
        </CardHeader>
        <CardContent>
          <form action={unlockTech} className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="tech-pw">Password</Label>
              <Input id="tech-pw" name="password" type="password" autoComplete="current-password" required disabled={!techGateConfigured()} />
            </div>
            <Button type="submit" className="w-full" disabled={!techGateConfigured()}>
              Open
            </Button>
            {e && <Alert tone="error">{ERRORS[e] ?? ERRORS.wrong}</Alert>}
          </form>
        </CardContent>
      </Card>
    );
  }
  return <Explainer />;
}

/* ------------------------------------------------------------------ content */

function Section({ id, title, intro, children }: { id: string; title: string; intro: React.ReactNode; children?: React.ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-h`} className="scroll-mt-6 space-y-3">
      <h2 id={`${id}-h`} className="text-xl font-semibold tracking-tight">
        {title}
      </h2>
      <div className="space-y-2 text-[15px] leading-relaxed">{intro}</div>
      {children && <div className="space-y-2">{children}</div>}
    </section>
  );
}

function More({ title, children, open = false }: { title: string; children: React.ReactNode; open?: boolean }) {
  return (
    <details className="group rounded-lg border bg-card px-4 py-3 [&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_code]:text-[13px]" open={open}>
      <summary className="cursor-pointer list-none font-medium marker:hidden [&::-webkit-details-marker]:hidden">
        <span className="mr-2 inline-block transition-transform group-open:rotate-90" aria-hidden>
          ▸
        </span>
        {title}
      </summary>
      <div className="mt-3 space-y-2 text-sm leading-relaxed text-muted-foreground [&_strong]:text-foreground">{children}</div>
    </details>
  );
}

function Table({ head, rows }: { head: string[]; rows: (string | React.ReactNode)[][] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead className="text-foreground">
          <tr>
            {head.map((h) => (
              <th key={h} className="border-b py-2 pr-4 font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-b last:border-0 align-top">
              {r.map((c, j) => (
                <td key={j} className="py-2 pr-4">
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const TOC = [
  ["what", "What Mirror is"],
  ["flow", "How a 360 works"],
  ["features", "What's built"],
  ["privacy", "Anonymity and privacy"],
  ["architecture", "Architecture"],
  ["stack", "Tech stack"],
  ["data", "Data model"],
  ["ai", "AI layer"],
  ["security", "Security"],
  ["billing", "Plans and payments"],
  ["enterprise", "Enterprise"],
  ["quality", "Testing and delivery"],
  ["ops", "Running it"],
  ["open", "Open decisions"],
] as const;

function Explainer() {
  return (
    <article className="space-y-10" data-testid="tech-explainer">
      <header className="space-y-3">
        <p className="text-sm text-muted-foreground">Private · not linked from the app</p>
        <h1 className="text-3xl font-semibold tracking-tight">How Mirror works</h1>
        <p className="text-lg text-muted-foreground">
          The product in plain language, with the technical detail one click away. Open any panel marked ▸ for the specifics.
        </p>
        <nav aria-label="On this page" className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
          {TOC.map(([id, label]) => (
            <a key={id} href={`#${id}`} className="text-primary underline-offset-4 hover:underline">
              {label}
            </a>
          ))}
        </nav>
        <form action={lockTech}>
          <button type="submit" className="text-xs text-muted-foreground underline">
            Lock this page on this device
          </button>
        </form>
      </header>

      <Section
        id="what"
        title="What Mirror is"
        intro={
          <>
            <p>
              Mirror is a personal 360° feedback platform. Anyone can ask the people around them (manager, peers, direct reports, clients, friends) how they
              experience them, anonymously, and get a clear, visual report with AI help to act on it. Coaches can run it for clients, and organizations can run
              it for teams and cohorts, always with the person&apos;s consent.
            </p>
            <p>It is development feedback, not a performance or hiring tool, and the person who is rated owns their data.</p>
          </>
        }
      >
        <More title="Who uses it">
          <p>
            <strong>Individuals</strong> run their own 360 for free (up to 5 raters) or unlock a full 360 / Pro. <strong>Coaches</strong> get a client
            workspace with consent-based sharing, session prep, white-label reports and a marketplace listing. <strong>Organizations</strong> run 360 rounds,
            see group-level analytics (never individuals without consent), and can add SSO, data residency and retention policies.
          </p>
        </More>
      </Section>

      <Section
        id="flow"
        title="How a 360 works"
        intro={
          <ol className="list-decimal space-y-1 pl-5">
            <li>The person picks a goal and a questionnaire (built-in, their own, imported from Excel/Forms, or AI-generated).</li>
            <li>They rate themselves first; the self-assessment locks so the comparison stays honest.</li>
            <li>They invite raters by email or a share link. Raters answer on a phone in about 10 minutes, in one of five languages.</li>
            <li>When enough people have answered, the 360 closes and a frozen report is generated.</li>
            <li>The report shows strengths, blind spots, rater-group views and themes; AI writes a summary, a development plan and coaches by chat.</li>
            <li>Pulse checks and re-runs track progress over time; goals, nudges and dashboards keep it going.</li>
          </ol>
        }
      >
        <More title="Lifecycle and states">
          <p>
            <code>DRAFT</code> (set up) → <code>READY</code> (self-assessment locked) → <code>COLLECTING</code> (invites sent, reminders run) →{" "}
            <code>CLOSED</code> (report frozen). Re-runs and pulses are new sessions of the same survey (<code>rootAssessmentId</code>, numbered{" "}
            <code>S1, S2…</code>) with a stable survey ID like <code>MRR-ATJA59</code>, so trends compare like for like.
          </p>
          <p>
            Rater links are derived HMAC tokens (no lookup table to leak). Drafts autosave; a rater can resume from the same link. Reminders and pulse
            reminders run from a daily cron.
          </p>
        </More>
      </Section>

      <Section id="features" title="What's built" intro={<p>Eleven build phases plus hardening and polish, all live.</p>}>
        <Table
          head={["Area", "What it does"]}
          rows={[
            ["Foundation", "Sign-in (magic link, Google, SSO), onboarding, built-in 7-competency questionnaire, setup wizard, invites, anonymous rater form, reminders"],
            ["Report", "Summary, radar, self-vs-others gap, Johari window, rater-group heatmap, distributions, question drill-down, comment themes, PDF"],
            ["AI", "Summary, development plan, comment de-identification for raters, questionnaire recommendation and generation, coach brief, chat, plain-English dashboard questions, translation, comment themes"],
            ["Progress", "Pulse checks, re-runs as numbered sessions, trends, before/after, goals, streaks, grouping by company/year/theme/score"],
            ["Coaches", "Client portfolio with opt-in sharing, session prep, notes and sessions, cross-client patterns (5+ clients), white-label, coach questionnaires, coach onboarding"],
            ["Organizations", "People, teams and cohorts, 360 rounds (incl. team 360), participation, team radar/heatmap, cohort comparison, opt-in talent grid"],
            ["Personalization", "AI coach chat and role-play, adaptive questions, personalized pulses, weekly nudges, sharing (badge, summary, full report)"],
            ["Analytics", "Benchmarks (anonymous norms), dashboard builder, scheduled dashboard emails, CSV export, read-only API"],
            ["Payments", "Credits ($1 = 1 credit, any amount, buyer pays fees), one free 360, editable pricing policy and discounts, coach and company plans, coach marketplace with referral fees (payments simulated until Stripe is switched on)"],
            ["Enterprise", "OIDC SSO per org, data residency (US/EU), retention, org audit log, personal activity log, data export and account deletion"],
            ["Polish", "Rater form in 5 languages, streaming AI replies, dark mode, mobile menu, installable app"],
          ]}
        />
      </Section>

      <Section
        id="privacy"
        title="Anonymity and privacy"
        intro={
          <p>
            Raters are anonymous by design: their answers are stored with no link to who they are, and results only appear when enough people in a group
            answered. Nobody else sees a person&apos;s results unless that person shares them.
          </p>
        }
      >
        <More title="How anonymity is enforced (on the server, not just the UI)">
          <ul className="list-disc space-y-1 pl-5">
            <li>
              <strong>No join path:</strong> a <code>Submission</code> has no reference to the <code>RaterInvite</code>; IDs are random UUIDv4 (no
              timestamps), and submission dates are truncated to the day.
            </li>
            <li>
              <strong>Thresholds:</strong> a rater group&apos;s results show only with at least 3 responses and 5 invitations (no manager exception);
              launching needs 5 invitations; the subject sees counts, never who answered; reminders go to non-responders without naming them; comments
              are quoted only with 3 or more writers in a group. Org, coach and benchmark aggregates need at least 5 people; benchmark slices 10, overall norms 30.
            </li>
            <li>
              <strong>Frozen reports:</strong> computed once at close, so nobody can diff before/after a late response.
            </li>
            <li>
              <strong>Comments:</strong> raters can have AI remove identifying details before saving (the original is never stored). Coaches, orgs and
              public shares get scores and themes without verbatim comments unless the person allows it.
            </li>
            <li>
              <strong>Rate limits</strong> on rater links, sign-in emails and share links use HMAC keys, so raw IPs and tokens are never stored.
            </li>
          </ul>
        </More>
        <More title="Consent, ownership and GDPR/CCPA">
          <p>
            Sharing with a coach or organization is opt-in per item (reports, comments, goals, plan) and can be withdrawn. Admins never see individual results
            without consent. People can download all their data (JSON) and delete their account; organizations can set a retention period. Every access to
            someone&apos;s data by a coach, admin or share-link visitor appears in their activity log.
          </p>
        </More>
      </Section>

      <Section id="architecture" title="Architecture" intro={<p>One web app on serverless hosting, one Postgres database, and swappable providers behind interfaces.</p>}>
        <figure className="rounded-lg border bg-card p-4">
          <svg viewBox="0 0 760 300" role="img" aria-labelledby="arch-t" className="h-auto w-full text-foreground">
            <title id="arch-t">Browsers and raters connect to a Next.js app on Vercel, which uses Postgres on Neon and external AI, email and payment providers.</title>
            <defs>
              <marker id="arr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                <path d="M0 0L10 5L0 10z" fill="currentColor" />
              </marker>
            </defs>
            <g fill="none" stroke="currentColor" strokeOpacity="0.5">
              <rect x="10" y="40" width="150" height="70" rx="10" />
              <rect x="10" y="170" width="150" height="70" rx="10" />
              <rect x="240" y="20" width="270" height="250" rx="12" strokeOpacity="0.8" />
              <rect x="590" y="20" width="160" height="60" rx="10" />
              <rect x="590" y="95" width="160" height="50" rx="10" />
              <rect x="590" y="160" width="160" height="50" rx="10" />
              <rect x="590" y="225" width="160" height="50" rx="10" />
            </g>
            <g fill="currentColor" fontSize="13" fontFamily="inherit">
              <text x="85" y="70" textAnchor="middle" fontWeight="600">People</text>
              <text x="85" y="90" textAnchor="middle" opacity="0.7">web · phone · PWA</text>
              <text x="85" y="200" textAnchor="middle" fontWeight="600">Raters</text>
              <text x="85" y="220" textAnchor="middle" opacity="0.7">anonymous link</text>
              <text x="375" y="48" textAnchor="middle" fontWeight="600">Next.js 16 app (Vercel)</text>
              <text x="260" y="80" opacity="0.8">Server components + actions</text>
              <text x="260" y="104" opacity="0.8">Route handlers: API v1, PDF, cron,</text>
              <text x="260" y="122" opacity="0.8">  chat stream, SSO, webhooks</text>
              <text x="260" y="148" opacity="0.8">Services: anonymity, reports, coach,</text>
              <text x="260" y="166" opacity="0.8">  org, billing, AI, audit</text>
              <text x="260" y="192" opacity="0.8">Auth.js v5 (JWT) · rate limits</text>
              <text x="260" y="216" opacity="0.8">Prisma 7 + node-postgres adapter</text>
              <text x="260" y="240" opacity="0.8">Daily cron: reminders, nudges,</text>
              <text x="260" y="258" opacity="0.8">  norms, retention, scheduled emails</text>
              <text x="670" y="46" textAnchor="middle" fontWeight="600">Postgres (Neon)</text>
              <text x="670" y="64" textAnchor="middle" opacity="0.7">AWS us-east-1</text>
              <text x="670" y="125" textAnchor="middle">AI: Groq gpt-oss</text>
              <text x="670" y="190" textAnchor="middle">Email provider</text>
              <text x="670" y="255" textAnchor="middle">Stripe · IdPs (OIDC)</text>
            </g>
            <g stroke="currentColor" strokeOpacity="0.6" markerEnd="url(#arr)">
              <line x1="160" y1="75" x2="238" y2="90" />
              <line x1="160" y1="205" x2="238" y2="190" />
              <line x1="510" y1="60" x2="588" y2="52" />
              <line x1="510" y1="120" x2="588" y2="120" />
              <line x1="510" y1="185" x2="588" y2="185" />
              <line x1="510" y1="245" x2="588" y2="250" />
            </g>
          </svg>
          <figcaption className="mt-2 text-xs text-muted-foreground">Everything except the database and third-party providers runs inside the one Next.js deployment.</figcaption>
        </figure>
        <More title="Code layout">
          <Table
            head={["Path", "What lives there"]}
            rows={[
              [<code key="a">src/app</code>, "Routes (App Router): app pages under (app), rater form under /r, public shares under /s, print view, API route handlers"],
              [<code key="b">src/lib/services</code>, "Business logic, one module per domain (assessments, raters, reports, coach, org, billing, marketplace, sso, …). Pages and actions call these."],
              [<code key="c">src/lib/ai</code>, "Provider interface, Groq/OpenAI/Anthropic/mock providers, daily caps, metering, residency rule, one file per AI feature"],
              [<code key="d">src/lib/report</code>, "Pure report computation (scores, gaps, Johari, themes) — unit-tested without a database"],
              [<code key="e">src/components</code>, "UI (shadcn-style primitives in ui/, charts in report/, feature components)"],
              [<code key="f">prisma</code>, "Schema, migrations, seed (demo users, coach, org, benchmark samples)"],
              [<code key="g">tests</code>, "Vitest unit and integration tests, Playwright end-to-end tests"],
            ]}
          />
        </More>
        <More title="Request paths">
          <p>
            Pages are React Server Components that call services directly; mutations are server actions returning <code>{"{ ok, error }"}</code>. Route
            handlers cover things that aren&apos;t pages: the read API (<code>/api/v1/*</code>, bearer tokens), PDF export, the daily cron, the AI chat stream
            (newline-delimited JSON), SSO start/callback, the Stripe webhook and CSV exports. Every service checks ownership and consent itself, so no page can
            show more than its viewer is allowed to see.
          </p>
        </More>
      </Section>

      <Section id="stack" title="Tech stack" intro={<p>Mainstream, free-tier-friendly tools; nothing exotic to hire for.</p>}>
        <Table
          head={["Layer", "Choice", "Why"]}
          rows={[
            ["Framework", "Next.js 16 (App Router, Turbopack), React 19.3, TypeScript 5", "One codebase for UI, API and jobs; server components keep data on the server"],
            ["UI", "Tailwind CSS 4, shadcn-style components (Radix), lucide icons, Geist font", "Accessible primitives, consistent design, dark mode via CSS tokens"],
            ["Charts", "Recharts 3 and D3 7 (custom SVG)", "Radar, heatmaps, distributions, trends; every chart has a text alternative"],
            ["Database", "PostgreSQL 16 on Neon (serverless, free tier)", "Relational data with strict constraints; branching for previews"],
            ["ORM", "Prisma 7 with the node-postgres driver adapter", "Typed queries, migrations; no query-engine binary at runtime"],
            ["Auth", "Auth.js v5 (JWT sessions): magic link, Google, per-org OIDC SSO", "Passwordless by default; enterprise SSO without a paid service"],
            ["AI", "Groq (open-weight gpt-oss-120b/20b) by default; Claude / GPT as optional premium", "Fast and free tier; provider-agnostic interface"],
            ["Validation", "Zod 4", "Every input parsed on the server"],
            ["PDF", "Playwright/Chromium (Sparticuz build on Vercel) with browser-print fallback", "Pixel-identical to the web report"],
            ["Imports", "read-excel-file, PapaParse", "Excel, CSV, Google Forms and Microsoft Forms exports"],
            ["Hosting", "Vercel (Hobby), daily Vercel Cron", "Zero-ops deploys, preview per pull request"],
            ["Testing", "Vitest 5, Playwright 1.63, axe-core", "Unit, integration (real Postgres) and end-to-end with accessibility checks"],
          ]}
        />
        <More title="Exact versions and notable packages">
          <p>
            next 16.4, react 19.3, prisma / @prisma/client / @prisma/adapter-pg 7.10, next-auth 5.0 beta.32, @auth/prisma-adapter 2.11, tailwindcss 4,
            recharts 3.10, d3 7.9, zod 4.6, pg 8.23, @sparticuz/chromium 153, playwright 1.63, vitest 5.1, @axe-core/playwright 4.14, jose (OIDC token
            verification). <code>npm audit</code>: 0 vulnerabilities.
          </p>
        </More>
      </Section>

      <Section id="data" title="Data model" intro={<p>About 40 tables in one Postgres schema. The core is small; most tables support coaching, organizations and billing.</p>}>
        <More title="Core entities">
          <ul className="list-disc space-y-1 pl-5">
            <li>
              <strong>User, SubjectProfile</strong> — the person; goals, tone, AI model choice, credits.
            </li>
            <li>
              <strong>Framework → Competency → Question</strong> — versioned questionnaires (built-in, custom, AI-generated).
            </li>
            <li>
              <strong>Assessment</strong> — one 360 session; <strong>AssessmentQuestion</strong> snapshots the statements (with rater-language translations).
            </li>
            <li>
              <strong>RaterGroup, RaterInvite</strong> — who was asked (names/emails live here only); <strong>Submission, Response, Comment</strong> —
              anonymous answers.
            </li>
            <li>
              <strong>Report</strong> — frozen JSON computed at close, plus AI summary and AI themes. <strong>DevelopmentPlan, Goal</strong> — follow-up.
            </li>
          </ul>
        </More>
        <More title="Coaching, organizations, analytics, billing">
          <p>
            <strong>CoachProfile, CoachClientLink</strong> (per-item sharing flags), CoachNote, CoachMeeting, MarketplaceReferral. <strong>Organization</strong>{" "}
            (seats, region, retention, SSO), OrgMember (consent flags), OrgGroup, OrgCampaign. <strong>Dashboard, BenchmarkNorm</strong> (percentiles only),
            ShareLink, ApiToken (hash only). <strong>Subscription, Payment, Entitlement, CreditLedger</strong>. <strong>AuditLog</strong> (scoped to an org and
            to whose data), <strong>AIInteractionLog</strong> (usage and cost metering), <strong>RateLimit</strong>, SsoTicket.
          </p>
        </More>
      </Section>

      <Section
        id="ai"
        title="AI layer"
        intro={
          <p>
            AI helps people understand and act on feedback; it never decides anything about them. It only sees the person&apos;s own anonymised aggregates
            (plus comment text when they ask for comment themes), and the product works without it.
          </p>
        }
      >
        <More title="Features and safeguards">
          <ul className="list-disc space-y-1 pl-5">
            <li>One function, <code>runAI</code> (and <code>runAIStream</code> for chat), handles model choice, per-feature daily caps, retries, JSON schema validation, cost metering and fallbacks.</li>
            <li>Every feature has a non-AI fallback (template text, keyword themes), so outages never block anyone.</li>
            <li>Guardrails: no health or personality inferences, no guessing who said what, supportive handling of distress.</li>
            <li>Residency: EU-region organizations&apos; round data never goes to a non-EU provider unless cleared in <code>AI_EU_PROVIDERS</code>.</li>
            <li>Raters always use the free model; premium models cost credits; usage is logged per feature.</li>
          </ul>
        </More>
        <More title="Feature list and daily caps">
          <Table
            head={["Feature", "Cap / day"]}
            rows={[
              ["Report summary · development plan", "10 each"],
              ["Comment de-identification (per rater)", "40"],
              ["Questionnaire recommendation · invite message · coach brief", "20 each"],
              ["AI questionnaire (paid, 1 credit)", "5"],
              ["AI coach chat: free / Pro / premium", "30 / 100 / 200"],
              ["Plain-English dashboard questions", "30"],
              ["Translation of custom statements (per 360)", "30"],
              ["Comment themes", "10"],
            ]}
          />
        </More>
      </Section>

      <Section id="security" title="Security" intro={<p>Defence in depth: server-side checks everywhere, least data, and audit trails.</p>}>
        <More title="Controls">
          <ul className="list-disc space-y-1 pl-5">
            <li>Ownership and consent checked in every service call; anonymity rules enforced in the database layer and API.</li>
            <li>Tokens (rater links, API tokens, invites) stored as hashes or derived with HMAC; secrets (SSO client secrets) encrypted with AES-256-GCM.</li>
            <li>Postgres-backed rate limits on public endpoints; sign-in emails normalised strictly (Unicode NFKC, ASCII only).</li>
            <li>SSO: authorization code + PKCE, state and nonce, ID-token verification via JWKS, DNS-verified domains, consumer domains blocked.</li>
            <li>CSV exports guard against spreadsheet formula injection; Stripe webhooks are signature-verified; payments are idempotent per payment.</li>
            <li>Audit log for admin, coach, sharing, SSO, billing and retention events; personal activity log for each person.</li>
          </ul>
        </More>
      </Section>

      <Section
        id="billing"
        title="Credits and payments"
        intro={<p>Everyone pays with credits ($1 = 1 credit), bought in any amount; the buyer pays card fees. Coaches and companies also have monthly plans. Payments are simulated until a provider is switched on.</p>}
      >
        <More title="What things cost (starting values; edited at /admin/pricing)">
          <Table
            head={["Item", "Credits", "Notes"]}
            rows={[
              ["First 360", "Free", "Everything except premium AI models (count set in the policy)"],
              ["360 survey / follow-up session", "49 / 49", "Unlimited raters and PDF; charged when invites first go out"],
              ["Pulse check", "9", "Personal and company"],
              ["Coach gifts a 360", "35", "From the coach's credits; the client's next 360 is paid for"],
              ["Company round", "12 per person", "From company credits; new companies get 120 welcome credits"],
              ["Premium AI", "Cost × 2", "Per request, in hundredths of a credit; the free model is free"],
              ["Top-up fees", "2.9% + 30¢", "Added to the price and paid by the buyer"],
              ["Coach Starter / Pro, company plan", "$29 / $79 / $49 a month", "Subscriptions"],
            ]}
          />
          <p className="mt-2">
            Prices, fees and the free-survey count live in the <code>PricingPolicy</code> table; percentage discounts per company or person live in{" "}
            <code>PriceDiscount</code> (best one wins). Wallets are on <code>Workspace.credits</code>, every change is in <code>CreditLedger</code>.
          </p>
        </More>
        <More title="How payments are wired">
          <p>
            A <code>PaymentProvider</code> interface has a stub (in-app test checkout) and Stripe Checkout (REST, no SDK). Setting{" "}
            <code>PAYMENTS_PROVIDER=stripe</code> plus keys switches to real payments; the signed webhook marks payments paid and fulfilment runs exactly once.
            Limits can be turned off with <code>BILLING_ENFORCED=false</code>.
          </p>
        </More>
      </Section>

      <Section id="enterprise" title="Enterprise" intro={<p>What larger organizations ask for, without paid identity or compliance vendors.</p>}>
        <More title="SSO, residency, retention, audit">
          <ul className="list-disc space-y-1 pl-5">
            <li>
              <strong>SSO (OIDC)</strong> per organization: Okta, Entra ID, Google Workspace, Auth0 and others. Domain proven by DNS TXT record; optional
              &ldquo;require SSO&rdquo;; just-in-time membership.
            </li>
            <li>
              <strong>Residency:</strong> US or EU per organization; enforced for AI processing today, with a documented path to an EU database.
            </li>
            <li>
              <strong>Retention:</strong> raw answers and comments deleted 12/24/36 months after close; reports keep aggregates.
            </li>
            <li>
              <strong>Audit:</strong> filterable org audit log with CSV export; personal activity log; data export and deletion.
            </li>
          </ul>
        </More>
        <More title="Personal and company workspaces (Phase 11)">
          <ul className="list-disc space-y-1 pl-5">
            <li>
              <strong>One workspace per item:</strong> every 360, plan, goal, chat, dashboard, share link and payment belongs to the person&apos;s Personal
              space or to one company. Database triggers assign it, so older code paths can&apos;t create data without one.
            </li>
            <li>
              <strong>Switcher and menus:</strong> a header switcher; each workspace shows only its own data and menu. Company workspaces have no personal
              billing or marketplace. The active workspace is a cookie re-checked against memberships on every request.
            </li>
            <li>
              <strong>Ownership:</strong> individual reports stay the person&apos;s. Companies keep frozen, anonymous round totals (counts and sums only), so
              people leaving never change past results. Leavers can copy their reports to Personal (no rater comments) during a 7-day grace period.
            </li>
            <li>
              <strong>Roles:</strong> Owner, Admin, Analyst, Member, checked on the server for every page and action; a route-inventory test fails if any
              route has no caller check.
            </li>
            <li>
              <strong>Company plan and AI:</strong> monthly plan plus company credits (30-day trial); allowed AI models; monthly AI budgets overall and per person with
              free-model fallback; usage recorded per workspace through request-scoped AI context.
            </li>
            <li>
              <strong>Company coaching and sign-in:</strong> company-paid coaching that the employee must accept first; a verified personal sign-in email
              keeps Personal reachable after leaving an SSO-only company.
            </li>
          </ul>
        </More>
      </Section>

      <Section id="quality" title="Testing and delivery" intro={<p>Every change runs the full test suite before it can be merged; every merge deploys automatically.</p>}>
        <More title="Tests">
          <p>
            About 260 unit and integration tests (Vitest; integration tests run against a real Postgres) and about 75 end-to-end tests (Playwright against a
            production build), including WCAG 2.2 AA checks with axe on key pages in light and dark mode and at phone width. Seed data creates realistic demo
            people, a coach with clients, an organization with 14 people and benchmark samples.
          </p>
        </More>
        <More title="Pipeline">
          <p>
            GitHub Actions: lint → typecheck → unit and integration tests → production build → seed → Playwright. Vercel builds a preview for every pull
            request and deploys <code>main</code> to production, running database migrations first. Work ships as one feature branch and pull request per
            phase.
          </p>
        </More>
      </Section>

      <Section id="ops" title="Running it" intro={<p>Low-cost by design: free tiers for hosting, database and AI; providers are swapped with environment variables.</p>}>
        <More title="Environments and configuration">
          <ul className="list-disc space-y-1 pl-5">
            <li>Production and previews on Vercel; database on Neon; AI on Groq (key in Vercel, production only).</li>
            <li>Daily cron: rater and pulse reminders, weekly nudges, scheduled dashboards, benchmark norms, retention, housekeeping.</li>
            <li>
              Key variables: <code>DATABASE_URL</code>, <code>AUTH_SECRET</code>, <code>GROQ_API_KEY</code>, <code>EMAIL_PROVIDER</code>,{" "}
              <code>PAYMENTS_PROVIDER</code>, <code>BILLING_ENFORCED</code>, <code>AI_EU_PROVIDERS</code>, <code>CRON_SECRET</code>. Demo sign-in and dev tools
              are switched by flags.
            </li>
          </ul>
        </More>
      </Section>

      <Section id="open" title="Open decisions" intro={<p>Things that need an account or a business decision rather than more code.</p>}>
        <ul className="list-disc space-y-1 pl-5 text-[15px]">
          <li>Email provider (e.g. Resend free tier) — needed before real people can sign in.</li>
          <li>Stripe account and final prices — needed before charging.</li>
          <li>Premium AI model and per-use price.</li>
          <li>Optional: EU database, SAML SSO, SMS invites.</li>
        </ul>
      </Section>
    </article>
  );
}

import Link from "next/link";
import { LEGAL, PROCESSORS } from "@/lib/legal";
import { ANONYMITY_FLOOR, INVITE_MARGIN } from "@/lib/anonymity";
import { DELETION_GRACE_DAYS } from "@/lib/services/my-data";
import { LegalPage } from "@/components/legal-page";

export const metadata = { title: "Security" };

/**
 * Public security overview for people and company buyers. Only states what is true today; keep it
 * in sync with the code and hosting (see docs/phases/funnel-security.md).
 */
export default function SecurityPage() {
  return (
    <LegalPage title="Security">
      <p>
        How {LEGAL.product} protects the people who ask for feedback and the people who give it. This page describes what is in place today, including
        what isn&apos;t yet. Questions, or a security questionnaire to fill in: {LEGAL.securityEmail}.
      </p>

      <h2>Where data lives</h2>
      <ul>
        <li>The app runs on Vercel (United States, Washington D.C. region). The database is Neon Postgres on AWS us-east-1 (United States).</li>
        <li>
          Companies can choose the European Union as their data region. Today that keeps their round data away from AI providers outside the EU; the data
          itself is still stored in the United States.
        </li>
        <li>Service providers we use are listed below and in the <Link href="/privacy" className="underline">privacy policy</Link>.</li>
      </ul>

      <h2>Encryption</h2>
      <ul>
        <li>All traffic uses HTTPS (TLS), with HTTP Strict Transport Security.</li>
        <li>The database provider encrypts stored data at rest.</li>
        <li>Single sign-on client secrets are encrypted again by {LEGAL.product} with AES-256-GCM.</li>
        <li>Sign-in links, rater links, share links and API tokens are stored only as one-way hashes, so a database copy can&apos;t be used to sign in.</li>
      </ul>

      <h2>Signing in and access</h2>
      <ul>
        <li>No passwords: people sign in with a one-time email link, Google, or their company&apos;s single sign-on (OpenID Connect, with PKCE, state and nonce checks).</li>
        <li>Companies can require their single sign-on for their email domain, after proving they own it.</li>
        <li>Company roles (Owner, Admin, Analyst, Member) limit who sees what. Every page and action checks who is asking on the server; an automated test fails if a new one doesn&apos;t.</li>
        <li>Sign-in, rater and share endpoints are rate-limited.</li>
      </ul>

      <h2>Anonymity for raters</h2>
      <ul>
        <li>Answers are stored without a link back to the invitation, the rater&apos;s name or their email.</li>
        <li>
          Results appear only when at least {ANONYMITY_FLOOR} people in a group answer and at least {ANONYMITY_FLOOR + INVITE_MARGIN} were invited; smaller groups are
          combined, with no exceptions (not even for managers).
        </li>
        <li>The person who asked, their coach and their company see how many answered, never who. Reminders go to non-responders without naming them.</li>
        <li>Written comments are quoted only when at least {ANONYMITY_FLOOR} people in a group wrote some, and raters can have AI remove identifying details.</li>
        <li>Reports are built only when a survey is closed, and a survey can&apos;t be reopened after results are shown.</li>
      </ul>

      <h2>Privacy by design</h2>
      <ul>
        <li>No advertising, analytics or tracking cookies, and no session recording or replay. Fonts are served by {LEGAL.product} itself.</li>
        <li>Product statistics are anonymous totals from data we already keep, with small numbers hidden.</li>
        <li>AI requests never include raters&apos; names or emails. Comment text is sent only for features that need it, such as removing identifying details or grouping themes.</li>
      </ul>

      <h2>Logging and monitoring</h2>
      <ul>
        <li>Companies get an audit log of sign-ins, role and consent changes, rounds, report views, settings and exports, downloadable as CSV. Raters never appear in it.</li>
        <li>People see an activity log of who viewed their reports and data.</li>
        <li>Errors are collected by our own monitor, with emails and tokens removed from messages. A health check watches the database and services.</li>
      </ul>

      <h2>Keeping and deleting data</h2>
      <ul>
        <li>People can download all their data and delete their account; deletion happens after a {DELETION_GRACE_DAYS}-day grace period.</li>
        <li>Companies can have individual answers deleted 12, 24 or 36 months after a round closes, keeping only totals.</li>
        <li>When someone leaves a company, their data in the company workspace is deleted after {DELETION_GRACE_DAYS} days.</li>
        <li>The database can be restored to any point in the last 6 hours. Longer backup retention is planned.</li>
      </ul>

      <h2>Development</h2>
      <ul>
        <li>Every change goes through a pull request with automated type checks, linting, unit, integration, end-to-end and accessibility tests before it is released.</li>
        <li>Secrets are kept in the hosting provider&apos;s encrypted settings, never in the code. Dependencies are kept up to date and checked for known vulnerabilities when upgraded.</li>
      </ul>

      <h2>If something goes wrong</h2>
      <p>
        If we confirm a breach that affects personal data, we will tell affected customers without undue delay, and within 72 hours where the law requires,
        with what happened, what data was involved and what we are doing about it.
      </p>

      <h2>Certifications</h2>
      <p>
        {LEGAL.product} doesn&apos;t have SOC 2 or ISO 27001 certification yet, and hasn&apos;t had an independent penetration test. We&apos;re happy to answer
        your security questionnaire, and companies can sign our <Link href="/dpa" className="underline">data processing agreement</Link>.
      </p>

      <h2>Service providers</h2>
      <ul>
        {PROCESSORS.map((p) => (
          <li key={p.name}>
            <strong>{p.name}</strong>: {p.purpose} ({p.location})
          </li>
        ))}
      </ul>

      <h2 id="report">Reporting a vulnerability</h2>
      <p>
        Email {LEGAL.securityEmail} with what you found and how to reproduce it. Please give us reasonable time to fix it before telling others, don&apos;t
        access more data than you need to show the problem, and don&apos;t disrupt the service or other people. We won&apos;t take legal action against good-faith
        research that follows these rules. Our contact is also in <a href="/.well-known/security.txt" className="underline">security.txt</a>.
      </p>
    </LegalPage>
  );
}

import Link from "next/link";
import { LEGAL, PROCESSORS } from "@/lib/legal";
import { DELETION_GRACE_DAYS } from "@/lib/services/my-data";
import { LegalPage } from "@/components/legal-page";

export const metadata = { title: "Privacy policy" };

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy policy">
      <p>
        {LEGAL.product} helps you collect anonymous 360° feedback about yourself. This policy explains what we collect, why, who can see it, and how to get
        it back or delete it. The short version: <strong>your feedback belongs to you</strong>, raters stay anonymous, we don&apos;t sell data, and you can
        delete everything at any time.
      </p>

      <h2>Who we are</h2>
      <p>
        {LEGAL.company}, {LEGAL.address} (&ldquo;we&rdquo;) runs {LEGAL.product} and is the controller of personal data described here. Contact:{" "}
        {LEGAL.contactEmail}. {LEGAL.dpo}.
      </p>
      <p>
        When an organization runs 360 rounds for its people, it decides to use {LEGAL.product} for that purpose; for organization features we act on its
        behalf, but your own report still belongs to you and is shared with the organization only if you choose.
      </p>

      <h2>What we collect</h2>
      <ul>
        <li>
          <strong>Account details:</strong> your email address, name, job title, career stage, industry and the goals you choose.
        </li>
        <li>
          <strong>Your 360s:</strong> questionnaires, your self-assessment, the names and email addresses of people you invite, invitation status, and the
          reports, plans, goals and AI conversations created from them.
        </li>
        <li>
          <strong>Raters&apos; answers:</strong> ratings and comments, stored <em>without</em> any link to the rater&apos;s name or email (see below).
        </li>
        <li>
          <strong>Coaching and organizations:</strong> who you work with and what you have chosen to share with them.
        </li>
        <li>
          <strong>Billing:</strong> what you bought and when. Card details are handled by our payment processor; we never see full card numbers.
        </li>
        <li>
          <strong>Technical and security data:</strong> sign-in events, an activity log of who accessed your data, and error reports. Rate limits store only
          one-way hashes of IP addresses and links.
        </li>
      </ul>

      <h2>How raters stay anonymous</h2>
      <ul>
        <li>Answers are saved with no reference to the invitation they came from, and submission dates are rounded to the day.</li>
        <li>Results for a rater group appear only once at least 3 people in it have answered (a manager is shown separately only if they agree).</li>
        <li>Raters can have AI remove details that might identify them before their comments are saved; the original wording is not kept.</li>
        <li>Reports are frozen when a 360 closes, so nobody can work out who answered late.</li>
      </ul>

      <h2>Why we use your data</h2>
      <ul>
        <li>To provide the service you asked for (performing our contract with you): running 360s, reports, coaching and organization features.</li>
        <li>To keep the service secure and working (our legitimate interests): fraud and abuse prevention, rate limits, audit logs, error monitoring.</li>
        <li>With your consent: sharing with a coach or organization, weekly nudges, contributing to anonymous benchmarks (you can opt out in Settings).</li>
        <li>To meet legal obligations, such as keeping billing records.</li>
      </ul>
      <p>
        {LEGAL.product} is for personal development. It is not designed for performance ratings or hiring decisions, and we never use AI to infer health or
        personality traits.
      </p>

      <h2>AI</h2>
      <p>
        AI features (summaries, development plans, the AI coach, translations and comment themes) send the minimum needed to an AI provider: usually
        anonymised aggregates of your report; comment text only when you ask for comment themes or a rater asks to de-identify their own comments. [Confirm with each provider&apos;s terms: providers do not use this data to train their models.] For organizations that choose the EU region, round data is never sent to a
        non-EU AI provider.
      </p>

      <h2>Who can see your data</h2>
      <ul>
        <li>
          <strong>You.</strong> Nobody else sees your report unless you share it.
        </li>
        <li>
          <strong>Your coach or organization</strong>, only what you choose to share, and you can stop sharing at any time. Organization admins only see
          group results with at least 5 people unless you share yours.
        </li>
        <li>
          <strong>People with a share link</strong> you created, until you revoke it.
        </li>
        <li>
          <strong>Our processors</strong>, listed below, only to run the service.
        </li>
      </ul>
      <p>We do not sell or rent personal data, and we do not show ads.</p>

      <h2>Processors</h2>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr>
              <th className="border-b py-2 pr-4 font-medium">Processor</th>
              <th className="border-b py-2 pr-4 font-medium">Purpose</th>
              <th className="border-b py-2 font-medium">Location</th>
            </tr>
          </thead>
          <tbody>
            {PROCESSORS.map((p) => (
              <tr key={p.name} className="border-b align-top last:border-0">
                <td className="py-2 pr-4">{p.name}</td>
                <td className="py-2 pr-4">{p.purpose}</td>
                <td className="py-2">{p.location}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p>Data is stored in the United States. Where we transfer data from the EU/UK, we rely on Standard Contractual Clauses or equivalent safeguards.</p>

      <h2>How long we keep it</h2>
      <ul>
        <li>Your data is kept until you delete it or your account.</li>
        <li>An organization can set a shorter period for 360s in its rounds; raw answers are then deleted 12, 24 or 36 months after a 360 closes.</li>
        <li>
          If you leave a company&apos;s workspace, your data there is deleted {DELETION_GRACE_DAYS} days later. If the company allows it, you can first copy your own
          reports to your Personal space (scores, themes and AI summaries, not raters&apos; written comments). Anonymous round totals the company already has
          are kept, because they cannot be linked to you.
        </li>
        <li>Deleted accounts are removed {DELETION_GRACE_DAYS} days after you ask (so you can change your mind), and from backups within 30 days.</li>
        <li>Security logs are kept for up to 2 years; billing records as long as the law requires.</li>
      </ul>

      <h2>Your rights and controls</h2>
      <p>Wherever you live, you can do all of this yourself in the app:</p>
      <ul>
        <li>
          <strong>Download</strong> everything we hold about you: <Link href="/settings" className="underline">Settings → Your data</Link>.
        </li>
        <li>
          <strong>Delete</strong> a single 360, all AI conversations, all goals and plans, all share links, or your whole account:{" "}
          <Link href="/settings" className="underline">Settings → Danger zone</Link>.
        </li>
        <li>
          <strong>See who accessed your data:</strong> <Link href="/settings/activity" className="underline">Settings → Activity on your data</Link>.
        </li>
        <li>
          <strong>Correct</strong> your profile, <strong>withdraw consent</strong> for sharing, nudges or benchmarks, at any time in Settings.
        </li>
      </ul>
      <p>
        Under laws such as the GDPR, UK GDPR and CCPA/CPRA you may also object to or restrict processing and complain to your data protection authority. For
        anything you can&apos;t do in the app, email {LEGAL.contactEmail}; we reply within 30 days.
      </p>

      <h2>Cookies and local storage</h2>
      <ul>
        <li>A session cookie to keep you signed in, and short-lived cookies for single sign-on.</li>
        <li>Your theme choice and, on the rater form, your language, saved in your browser.</li>
        <li>No advertising or cross-site tracking cookies.</li>
      </ul>

      <h2>Security</h2>
      <p>
        Data is encrypted in transit, links and tokens are stored as one-way hashes, secrets are encrypted at rest, access is checked on every request, and
        sensitive actions are logged. No system is perfectly secure; if a breach affects you, we will tell you as the law requires.
      </p>

      <h2>Children</h2>
      <p>{LEGAL.product} is not intended for anyone under 16, and we do not knowingly collect their data.</p>

      <h2>Changes</h2>
      <p>If we make material changes we will tell you in the app or by email before they take effect. The date at the top shows the current version.</p>
    </LegalPage>
  );
}

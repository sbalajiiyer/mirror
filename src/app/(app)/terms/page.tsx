import Link from "next/link";
import { LEGAL } from "@/lib/legal";
import { LegalPage } from "@/components/legal-page";

export const metadata = { title: "Terms of service" };

export default function TermsPage() {
  return (
    <LegalPage title="Terms of service">
      <p>
        These terms are an agreement between you and {LEGAL.company} for using {LEGAL.product}. By creating an account or giving feedback, you agree to
        them. Please also read our <Link href="/privacy" className="underline">privacy policy</Link>.
      </p>

      <h2>The service</h2>
      <p>
        {LEGAL.product} lets you run anonymous 360° feedback on yourself, read reports, get AI suggestions, work with a coach, and run 360 rounds for teams.
        It is a development tool. It is not designed or intended for performance ratings, pay, promotion, disciplinary or hiring decisions, and you must not
        use it for those purposes without the informed consent of the people involved.
      </p>

      <h2>Your account</h2>
      <ul>
        <li>You must be at least 16 and able to agree to these terms.</li>
        <li>Keep access to your email (and your organization&apos;s sign-in, if you use SSO) secure; you are responsible for activity on your account.</li>
        <li>Give accurate information and keep it up to date.</li>
      </ul>

      <h2>Inviting raters</h2>
      <ul>
        <li>Only invite people you know and who would reasonably expect to hear from you; don&apos;t use {LEGAL.product} to send spam.</li>
        <li>You are responsible for having a lawful basis to give us their name and email address so we can invite them.</li>
        <li>Don&apos;t try to find out who said what. Attempting to identify anonymous raters is a breach of these terms.</li>
      </ul>

      <h2>Giving feedback (raters)</h2>
      <p>
        If you are a rater, please be honest, specific and respectful. Don&apos;t include information about third parties, health or other sensitive
        details, or anything unlawful. Your answers are stored without your name and shown only in combination with others, as described in the privacy
        policy.
      </p>

      <h2>Acceptable use</h2>
      <p>Don&apos;t misuse the service. In particular, don&apos;t:</p>
      <ul>
        <li>harass, threaten or defame anyone, or post unlawful or hateful content;</li>
        <li>try to break, overload, scrape or reverse-engineer the service, or get around its limits or security;</li>
        <li>use another person&apos;s account, or the read API in ways that break these terms;</li>
        <li>use AI features to produce harmful content or to make decisions about people that the service is not meant for.</li>
      </ul>

      <h2>Your content</h2>
      <p>
        You own your content (your 360s, reports, goals and notes). You give us a limited licence to store, process and display it only to run the service
        for you and the people you share it with. You can download or delete it at any time from <Link href="/settings" className="underline">Settings</Link>.
      </p>

      <h2>Coaches and organizations</h2>
      <ul>
        <li>Coaches must respect what clients choose to share and use it only for coaching them.</li>
        <li>
          Organizations must tell their people how 360 rounds will be used, must not pressure anyone to share individual results, and are responsible for
          their own obligations as employers.
        </li>
        <li>Marketplace coaches are independent; sessions are arranged and paid directly between coach and client.</li>
      </ul>

      <h2>Plans, payments and refunds</h2>
      <ul>
        <li>Paid plans and credits are described on the Billing page, with prices shown before you pay.</li>
        <li>Yearly and monthly plans run for the period bought; you can stop renewal at any time and keep access to the end of the period.</li>
        <li>[Refund policy, e.g. refunds within 14 days for unused purchases, and any statutory rights in your country.]</li>
        <li>We may change prices for future periods with notice.</li>
      </ul>

      <h2>AI features</h2>
      <p>
        AI suggestions can be wrong or incomplete. Use your own judgement; they are not professional, medical, legal or psychological advice.
      </p>

      <h2>Availability and changes</h2>
      <p>
        We work to keep {LEGAL.product} available and secure but can&apos;t promise it will always be uninterrupted. We may change or discontinue features;
        if we close the service, we will give reasonable notice so you can download your data.
      </p>

      <h2>Ending your account</h2>
      <p>
        You can delete your account at any time (Settings → Danger zone). We may suspend or close accounts that seriously or repeatedly break these terms,
        after notice where reasonable.
      </p>

      <h2>Liability</h2>
      <p>
        To the extent the law allows, the service is provided &ldquo;as is&rdquo;, and our total liability for any claim is limited to the amount you paid us
        in the 12 months before it (or USD 100 if you haven&apos;t paid). Nothing here limits liability that can&apos;t be limited by law, or your
        statutory rights as a consumer.
      </p>

      <h2>Law and disputes</h2>
      <p>These terms are governed by the laws of {LEGAL.governingLaw}, without affecting mandatory consumer protections where you live.</p>

      <h2>Changes to these terms</h2>
      <p>We will tell you about material changes in advance. Continuing to use the service after they take effect means you accept them.</p>

      <h2>Contact</h2>
      <p>
        {LEGAL.company}, {LEGAL.address}. Email: {LEGAL.contactEmail}.
      </p>
    </LegalPage>
  );
}

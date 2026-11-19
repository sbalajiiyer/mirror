import Link from "next/link";
import { LEGAL, PROCESSORS } from "@/lib/legal";
import { LegalPage } from "@/components/legal-page";

export const metadata = { title: "Data processing agreement" };

/**
 * Template data processing agreement (GDPR Article 28 / UK GDPR) for companies. The customer is the
 * controller of its workspace data; Mirror is the processor. Placeholders in [brackets].
 */
export default function DpaPage() {
  return (
    <LegalPage title="Data processing agreement">
      <p>
        This agreement applies when a company (the <strong>customer</strong>) uses {LEGAL.product} for its people, and forms part of our{" "}
        <Link href="/terms" className="underline">terms of service</Link>. For the company workspace, the customer is the controller and {LEGAL.company} is the
        processor. For people&apos;s own Personal workspace, {LEGAL.company} is the controller, as described in the <Link href="/privacy" className="underline">privacy policy</Link>.
        To sign a copy, email {LEGAL.contactEmail} with your company&apos;s legal name and signatory.
      </p>

      <h2>1. What we process</h2>
      <ul>
        <li><strong>Subject matter and duration:</strong> running {LEGAL.product} for the customer, for as long as the customer uses it, plus the deletion periods below.</li>
        <li><strong>Purpose:</strong> 360° feedback rounds, reports, company dashboards, coaching the customer pays for, and support.</li>
        <li><strong>People:</strong> the customer&apos;s members and admins, and the raters they invite.</li>
        <li>
          <strong>Data:</strong> names, work email addresses, roles and teams; survey answers and comments (stored without a link to the rater); reports and
          totals; sign-in and audit records. We don&apos;t ask for special-category data, and raters are asked not to include it.
        </li>
      </ul>

      <h2>2. Our commitments</h2>
      <ul>
        <li>We process the data only on the customer&apos;s documented instructions: these terms, its settings in {LEGAL.product}, and written requests.</li>
        <li>Everyone who can access the data is bound by confidentiality.</li>
        <li>We keep the technical and organisational measures described on our <Link href="/security" className="underline">security page</Link>, and won&apos;t reduce them materially.</li>
        <li>We help the customer answer people&apos;s requests (access, correction, deletion, export) and with impact assessments, mostly through the tools in {LEGAL.product}.</li>
        <li>We tell the customer about a personal data breach without undue delay, and within 72 hours of confirming it, with the information they need to meet their own duties.</li>
      </ul>

      <h2>3. Sub-processors</h2>
      <p>The customer agrees to these sub-processors. We will give at least 30 days&apos; notice of a new one by email to company owners; the customer may object, and if we can&apos;t resolve it, end the service and get a refund of prepaid amounts for the remaining period.</p>
      <ul>
        {PROCESSORS.map((p) => (
          <li key={p.name}>
            <strong>{p.name}</strong>: {p.purpose} ({p.location})
          </li>
        ))}
      </ul>

      <h2>4. International transfers</h2>
      <p>
        Data is stored in the United States. Transfers of personal data from the EEA, UK or Switzerland are covered by the EU Standard Contractual Clauses
        (module 2, controller to processor), the UK Addendum and the Swiss amendments, which are incorporated by reference, and by our sub-processors&apos; own
        transfer terms. [Governing law and supervisory authority for the clauses: to be completed.]
      </p>

      <h2>5. Audits</h2>
      <p>
        We answer reasonable security questionnaires and provide the information needed to show we meet this agreement. If that isn&apos;t enough, the customer may
        run an audit once a year with 30 days&apos; notice, at its own cost, by an auditor bound by confidentiality, in a way that doesn&apos;t disrupt the service or
        put other customers&apos; data at risk.
      </p>

      <h2>6. When the service ends</h2>
      <p>
        Owners can export company results before closing the company workspace. We delete the customer&apos;s data within 30 days after the service ends, unless
        the law requires us to keep it. People keep their own Personal workspace and any reports they copied there, as described in the privacy policy.
      </p>

      <h2>7. Liability and order of precedence</h2>
      <p>Liability is as set out in the terms of service. If this agreement and the terms conflict on data protection, this agreement wins.</p>

      <p className="text-sm text-muted-foreground">
        {LEGAL.company}, {LEGAL.address}. Data protection contact: {LEGAL.dpo}.
      </p>
    </LegalPage>
  );
}

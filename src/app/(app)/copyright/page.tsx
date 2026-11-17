import Link from "next/link";
import { LEGAL } from "@/lib/legal";
import { LegalPage } from "@/components/legal-page";

export const metadata = { title: "Copyright and DMCA" };

/** Copyright policy with the designated DMCA agent (17 U.S.C. § 512(c)(2)). Public, linked from every page footer. */
export default function CopyrightPage() {
  const a = LEGAL.dmcaAgent;
  return (
    <LegalPage title="Copyright and DMCA">
      <p>
        {LEGAL.product} respects copyright. People can add their own content (questionnaires, comments, coach profiles and branding). If you believe
        something on {LEGAL.product} infringes your copyright, send a notice to our designated agent and we will remove or disable it.
      </p>

      <h2>Designated agent</h2>
      <address className="not-italic" data-testid="dmca-agent">
        {a.name}
        <br />
        {LEGAL.company}
        <br />
        {a.address}
        <br />
        Email: {a.email}
        <br />
        Phone: {a.phone}
      </address>

      <h2>What to include in a notice</h2>
      <ul>
        <li>Your physical or electronic signature (or that of someone authorised to act for the copyright owner).</li>
        <li>The copyrighted work you say is infringed.</li>
        <li>The material you say infringes it, with enough detail for us to find it (for example, a link).</li>
        <li>Your name, address, phone number and email address.</li>
        <li>A statement that you believe in good faith that the use is not authorised by the owner, its agent or the law.</li>
        <li>A statement that the information is accurate and, under penalty of perjury, that you are the owner or authorised to act for the owner.</li>
      </ul>

      <h2>Counter-notice</h2>
      <p>
        If your content was removed and you believe that was a mistake, you can send our agent a counter-notice with your signature, the removed material
        and where it was, a statement under penalty of perjury that you believe it was removed by mistake or misidentification, and your name, address and
        phone number with consent to the jurisdiction of the federal court for your district (or, outside the U.S., any district where we may be found). We
        will forward it to the person who sent the notice and may restore the material after 10 to 14 business days unless they tell us they have filed a
        court action.
      </p>

      <h2>Repeat infringers</h2>
      <p>We close the accounts of people who repeatedly infringe copyright, in appropriate circumstances.</p>

      <p>
        See also our <Link href="/terms" className="underline">terms of service</Link>. Sending a false notice or counter-notice can make you liable for
        damages.
      </p>
    </LegalPage>
  );
}

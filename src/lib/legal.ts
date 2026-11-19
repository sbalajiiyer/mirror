/**
 * Details shown in the privacy policy and terms. Placeholders in [brackets] until the owner fills
 * them in; while LEGAL_DRAFT is true both pages show a "draft pending legal review" banner.
 */
export const LEGAL = {
  company: "[Company legal name]",
  product: "Mirror",
  contactEmail: "[privacy@your-domain]",
  address: "[Registered address]",
  governingLaw: "[State/country of governing law]",
  effectiveDate: "[Effective date]",
  dpo: "[Data protection contact, if required]",
  /** Where to report security problems (security.txt, /security). */
  securityEmail: "[security@your-domain]",
  /** Minimum age to create an account (also stated in the terms). Checked by a neutral age screen at sign-up. */
  minimumAge: 16,
  /** Designated agent for copyright (DMCA) notices, as registered with the U.S. Copyright Office. */
  dmcaAgent: {
    name: "[Designated agent name]",
    address: "[Agent postal address]",
    email: "[copyright@your-domain]",
    phone: "[Agent phone]",
  },
} as const;

/**
 * Postal address shown in the footer of every non-essential email (CAN-SPAM). Set MAIL_POSTAL_ADDRESS;
 * a registered P.O. box or commercial mail-receiving address is fine.
 */
export const mailPostalAddress = () => process.env.MAIL_POSTAL_ADDRESS?.trim() || LEGAL.address;

export const LEGAL_DRAFT = true;

/** Processors we share data with (keep in sync with the stack). */
export const PROCESSORS = [
  { name: "Vercel Inc.", purpose: "Hosting and running the application", location: "United States" },
  { name: "Neon (Databricks)", purpose: "Database hosting", location: "United States (AWS us-east-1)" },
  { name: "Groq, Inc.", purpose: "AI processing (summaries, plans, chat, translation) of anonymised aggregates and, when you ask, comment text", location: "United States" },
  { name: "Anthropic, PBC / OpenAI, L.L.C. (only if a premium AI model is chosen)", purpose: "The same AI features, on a premium model the person or company picked", location: "United States" },
  { name: "Email delivery provider", purpose: "Sign-in links, rater invitations and reminders", location: "[to be confirmed]" },
  { name: "Stripe, Inc. (when payments are enabled)", purpose: "Payment processing; we never see full card numbers", location: "United States" },
  { name: "Your organization's identity provider (only if it uses SSO)", purpose: "Single sign-on", location: "Chosen by your organization" },
] as const;

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
} as const;

export const LEGAL_DRAFT = true;

/** Processors we share data with (keep in sync with the stack). */
export const PROCESSORS = [
  { name: "Vercel Inc.", purpose: "Hosting and running the application", location: "United States" },
  { name: "Neon (Databricks)", purpose: "Database hosting", location: "United States (AWS us-east-1)" },
  { name: "Groq, Inc.", purpose: "AI processing (summaries, plans, chat, translation) of anonymised aggregates and, when you ask, comment text", location: "United States" },
  { name: "Email delivery provider", purpose: "Sign-in links, rater invitations and reminders", location: "[to be confirmed]" },
  { name: "Stripe, Inc. (when payments are enabled)", purpose: "Payment processing; we never see full card numbers", location: "United States" },
  { name: "Your organization's identity provider (only if it uses SSO)", purpose: "Single sign-on", location: "Chosen by your organization" },
] as const;

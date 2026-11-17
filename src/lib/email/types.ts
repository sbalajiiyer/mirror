export type EmailMessage = {
  to: string;
  subject: string;
  text: string;
  html?: string;
  /** Logical template name, e.g. "rater-invite", stored for the outbox / audit trail. */
  template: string;
  /** Display name for the sender, e.g. "Alex Silva via Mirror". The address stays Mirror's (EMAIL_FROM). */
  fromName?: string;
  /** Where replies go, e.g. the person asking for feedback. */
  replyTo?: string;
};

/** Every email provider implements this. Add new providers in src/lib/email/index.ts. */
export interface EmailSender {
  readonly name: string;
  send(message: EmailMessage): Promise<{ id?: string }>;
}

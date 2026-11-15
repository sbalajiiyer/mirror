export type EmailMessage = {
  to: string;
  subject: string;
  text: string;
  html?: string;
  /** Logical template name, e.g. "rater-invite", stored for the outbox / audit trail. */
  template: string;
};

/** Every email provider implements this. Add new providers in src/lib/email/index.ts. */
export interface EmailSender {
  readonly name: string;
  send(message: EmailMessage): Promise<{ id?: string }>;
}

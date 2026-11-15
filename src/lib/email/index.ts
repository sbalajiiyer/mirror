import { db } from "@/lib/db";
import { consoleSender } from "./console";
import type { EmailMessage, EmailSender } from "./types";

export type { EmailMessage, EmailSender };

/**
 * Pick the email provider from EMAIL_PROVIDER. Only "console" exists today; choosing a
 * real provider (Resend, Postmark, SES, SMTP…) is an open decision in docs/STATUS.md.
 */
export function getEmailSender(): EmailSender {
  const provider = process.env.EMAIL_PROVIDER ?? "console";
  switch (provider) {
    case "console":
      return consoleSender;
    default:
      console.warn(`[email] Unknown EMAIL_PROVIDER "${provider}", falling back to console`);
      return consoleSender;
  }
}

/** Send an email and record it in the Notification table. Never throws. */
export async function sendEmail(message: EmailMessage, sender: EmailSender = getEmailSender()) {
  const row = await db.notification.create({
    data: {
      to: message.to,
      template: message.template,
      subject: message.subject,
      body: message.text,
      provider: sender.name,
    },
  });
  try {
    await sender.send(message);
    await db.notification.update({ where: { id: row.id }, data: { status: "SENT", sentAt: new Date() } });
    return { ok: true as const, id: row.id };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    await db.notification.update({ where: { id: row.id }, data: { status: "FAILED", error } });
    console.error(`[email] send failed: ${error}`);
    return { ok: false as const, id: row.id, error };
  }
}

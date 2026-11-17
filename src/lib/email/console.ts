import type { EmailSender } from "./types";

/**
 * Default provider: no external service. Logs the email; the Notification row written by
 * sendEmail() acts as a local outbox (see /dev/outbox when DEV_TOOLS_ENABLED=true).
 */
export const consoleSender: EmailSender = {
  name: "console",
  async send(message) {
    const from = message.fromName ? ` from="${message.fromName}"` : "";
    const reply = message.replyTo ? ` reply-to=${message.replyTo}` : "";
    const unsub = message.headers?.["List-Unsubscribe"] ? ` list-unsubscribe=${message.headers["List-Unsubscribe"]}` : "";
    console.info(`[email:console] to=${message.to}${from}${reply}${unsub} subject="${message.subject}"\n${message.text}\n`);
    return {};
  },
};

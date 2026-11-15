import type { EmailSender } from "./types";

/**
 * Default provider: no external service. Logs the email; the Notification row written by
 * sendEmail() acts as a local outbox (see /dev/outbox when DEV_TOOLS_ENABLED=true).
 */
export const consoleSender: EmailSender = {
  name: "console",
  async send(message) {
    console.info(`[email:console] to=${message.to} subject="${message.subject}"\n${message.text}\n`);
    return {};
  },
};

/**
 * Grant AI credits to a user until payments launch (Phase 9).
 *   npm run credits:grant -- someone@example.com 3
 * Against production: DATABASE_URL="<neon url>" npm run credits:grant -- someone@example.com 3
 */
import "dotenv/config";
import { db } from "../src/lib/db";

async function main() {
  const [email, amountArg] = process.argv.slice(2);
  const amount = Number(amountArg ?? 1);
  if (!email || !Number.isInteger(amount) || amount <= 0) {
    console.error("Usage: npm run credits:grant -- <email> <positive amount>");
    process.exit(1);
  }
  const user = await db.user.findUnique({ where: { email: email.toLowerCase() }, include: { profile: true } });
  if (!user?.profile) {
    console.error(`No onboarded user with email ${email}`);
    process.exit(1);
  }
  await db.$transaction([
    db.subjectProfile.update({ where: { userId: user.id }, data: { aiCredits: { increment: amount } } }),
    db.creditLedger.create({ data: { userId: user.id, delta: amount, reason: "grant", ref: "cli" } }),
  ]);
  const p = await db.subjectProfile.findUniqueOrThrow({ where: { userId: user.id } });
  console.log(`Granted ${amount} credit(s) to ${email}. Balance: ${p.aiCredits}`);
}

main().finally(() => db.$disconnect());

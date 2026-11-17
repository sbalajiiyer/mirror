/**
 * Give a person credits ($1 = 1 credit), e.g. for support or a refund. Recorded in CreditLedger.
 *   npm run credits:grant -- someone@example.com 50
 * Against production: DATABASE_URL="<neon url>" npm run credits:grant -- someone@example.com 50
 */
import "dotenv/config";
import { db } from "../src/lib/db";

async function main() {
  const [email, amountArg] = process.argv.slice(2);
  const amount = Number(amountArg ?? 1);
  if (!email || !Number.isInteger(amount) || amount <= 0) {
    console.error("Usage: npm run credits:grant -- <email> <whole credits>");
    process.exit(1);
  }
  const user = await db.user.findUnique({ where: { email: email.toLowerCase() } });
  const ws = user ? await db.workspace.findUnique({ where: { ownerId: user.id } }) : null;
  if (!user || !ws) {
    console.error(`No user with email ${email}`);
    process.exit(1);
  }
  const after = await db.$transaction(async (tx) => {
    const w = await tx.workspace.update({ where: { id: ws.id }, data: { credits: { increment: amount * 100 } } });
    await tx.creditLedger.create({ data: { workspaceId: ws.id, userId: user.id, delta: amount * 100, reason: "grant", ref: "cli", balanceAfter: w.credits } });
    return w.credits;
  });
  console.log(`Granted ${amount} credit(s) to ${email}. Balance: ${(after / 100).toFixed(2)}`);
}

main().finally(() => db.$disconnect());

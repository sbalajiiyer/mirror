/**
 * Verify (or un-verify) a coach for the marketplace.
 *   npm run coach:verify -- coach@example.com          # verify
 *   npm run coach:verify -- coach@example.com --revoke # remove verification
 * Against production: DATABASE_URL="<neon url>" npm run coach:verify -- coach@example.com
 */
import "dotenv/config";
import { db } from "../src/lib/db";

async function main() {
  const [email, flag] = process.argv.slice(2);
  if (!email) {
    console.error("Usage: npm run coach:verify -- <email> [--revoke]");
    process.exit(1);
  }
  const user = await db.user.findUnique({ where: { email: email.toLowerCase() }, include: { coachProfile: true } });
  if (!user?.coachProfile) {
    console.error(`No coach workspace for ${email}`);
    process.exit(1);
  }
  const verified = flag !== "--revoke";
  await db.coachProfile.update({ where: { userId: user.id }, data: { verified } });
  await db.auditLog.create({ data: { actorId: null, action: verified ? "marketplace.verify" : "marketplace.unverify", entity: "CoachProfile", entityId: user.id } });
  console.log(`${email}: ${verified ? "verified" : "verification removed"}${user.coachProfile.listed ? "" : " (not listed yet)"}`);
}

main().finally(() => db.$disconnect());

/** Print a TECH_PAGE_PASSWORD_HASH value: npm run tech:hash -- 'your password' */
import { scryptSync, randomBytes } from "node:crypto";

const pw = process.argv[2];
if (!pw) {
  console.error("Usage: npm run tech:hash -- '<password>'");
  process.exit(1);
}
const salt = randomBytes(16).toString("base64url");
console.log(`scrypt$${salt}$${scryptSync(pw, salt, 32).toString("base64url")}`);

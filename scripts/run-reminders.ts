import "dotenv/config";
import { runReminders } from "../src/lib/jobs/reminders";
import { db } from "../src/lib/db";

runReminders()
  .then((r) => console.log(`Reminders: checked ${r.checked}, sent ${r.sent}`))
  .finally(() => db.$disconnect());

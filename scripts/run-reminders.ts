import "dotenv/config";
import { runPulseReminders, runReminders } from "../src/lib/jobs/reminders";
import { db } from "../src/lib/db";

Promise.all([runReminders(), runPulseReminders()])
  .then(([r, p]) => console.log(`Rater reminders: checked ${r.checked}, sent ${r.sent}. Pulse reminders: sent ${p.sent}`))
  .finally(() => db.$disconnect());

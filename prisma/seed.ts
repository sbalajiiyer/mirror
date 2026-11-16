/**
 * Demo data: one subject ("Alex Morgan", demo@mirror.local) with
 *  - a CLOSED 360 with 12 raters (manager opted-in, 4 peers, 4 direct reports, 3 clients)
 *  - a COLLECTING 360 to show the progress tracker
 * Run: npm run db:seed   (idempotent: wipes and recreates the demo user)
 */
import "dotenv/config";
import { randomUUID } from "node:crypto";
import type { RaterGroupKind } from "@prisma/client";
import { db } from "../src/lib/db";
import { CORE_360 } from "../src/lib/frameworks/core-360";
import { syncFramework } from "../src/lib/frameworks/sync";
import { DEFAULT_INVITE_MESSAGE } from "../src/lib/constants";
import { DEMO_EMAIL } from "../src/lib/demo";
import { derivedToken, hashToken } from "../src/lib/tokens";
import { buildAndStoreReport } from "../src/lib/services/reports";

// Deterministic PRNG so the demo report always looks the same.
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(360);
const normal = () => {
  const u = 1 - rand();
  const v = rand();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
};
const pick = <T,>(xs: T[]) => xs[Math.floor(rand() * xs.length)];
const clamp = (x: number) => Math.max(1, Math.min(5, Math.round(x)));

const OTHERS_BASE: Record<string, number> = {
  leadership: 3.9,
  communication: 3.3,
  execution: 4.4,
  collaboration: 4.1,
  strategic_thinking: 4.1,
  emotional_intelligence: 3.4,
  growth_mindset: 3.8,
};
const SELF: Record<string, number[]> = {
  leadership: [4, 4, 4, 4],
  communication: [5, 4, 4, 4], // blind spot: others see it lower
  execution: [4, 5, 4, 4],
  collaboration: [4, 4, 4, 4],
  strategic_thinking: [3, 3, 3, 4], // hidden strength: others see it higher
  emotional_intelligence: [4, 3, 4, 4],
  growth_mindset: [4, 4, 4, 5],
};
const QUESTION_OFFSET: Record<string, number> = {
  "communication.listening": -0.6,
  "communication.informs": -0.2,
  "leadership.delegates": -0.4,
  "emotional_intelligence.composure": -0.4,
  "execution.delivers": 0.3,
  "strategic_thinking.big_picture": 0.3,
  "collaboration.credit": 0.3,
};
const GROUP_BIAS: Partial<Record<RaterGroupKind, Record<string, number>>> = {
  DIRECT_REPORT: { "leadership.delegates": -0.7, emotional_intelligence: -0.2, "leadership.develops": 0.2 },
  PEER: { collaboration: 0.2, "communication.listening": -0.2 },
  CLIENT: { execution: 0.3, communication: 0.4, emotional_intelligence: 0.3 },
  MANAGER: { strategic_thinking: 0.3, execution: 0.2 },
};

const COMMENTS = {
  START: [
    "Start delegating more of the detailed work and trusting the team to own it.",
    "Start sharing the reasoning behind roadmap decisions earlier, not just the outcome.",
    "Start pausing before replying in meetings so quieter people get space to speak.",
    "Start holding regular 1:1 career conversations with the team.",
    "Start sending a short weekly update so stakeholders aren't surprised.",
    "Start asking for feedback on your own ideas before they're fully formed.",
    "Start writing down decisions and trade-offs so we can refer back to them.",
    "Start involving engineering earlier in discovery.",
  ],
  STOP: [
    "Stop interrupting when others are still explaining their point.",
    "Stop jumping in to fix things yourself when the team is close to a solution — it can feel like micromanaging.",
    "Stop scheduling back-to-back meetings with no agenda.",
    "Stop reacting so quickly under pressure; it can come across as frustrated.",
    "Stop rewriting other people's documents instead of giving feedback.",
    "Stop saying yes to every request; the team gets overloaded.",
    "Stop letting meetings run late.",
  ],
  CONTINUE: [
    "Continue delivering on commitments — you are the most reliable person I work with.",
    "Continue connecting our work to the bigger picture and long-term strategy.",
    "Continue giving credit to the team publicly.",
    "Continue being so well prepared for client meetings.",
    "Continue making clear decisions when things are ambiguous.",
    "Continue championing the customer in every discussion.",
    "Continue being curious and open to learning new things.",
    "Continue the calm, structured way you run planning.",
  ],
  GENERAL: [
    "Alex is a strong, reliable product leader with a great strategic sense. Listening more would make a big difference.",
    "Working with Alex is easy because commitments are always met. Sometimes the communication with the wider team lags behind decisions.",
    "Alex has a clear vision for the product and helps us see why our work matters.",
    "I'd love Alex to trust the team more and step back from the details.",
    "One of the best partners I've had on the client side — clear, responsive and well prepared.",
    "Under pressure Alex can get short with people, but always follows up and apologises.",
  ],
  COMPETENCY: {
    communication: [
      "Very clear in writing, but in meetings tends to talk over people.",
      "Presentations are excellent; day-to-day updates to the team are less consistent.",
      "Could listen more before responding.",
    ],
    leadership: [
      "Sets a clear direction but sometimes hard to let go of control.",
      "Really invests in helping people grow.",
    ],
    strategic_thinking: ["Thinks long-term and sees the big picture better than anyone on the team.", "Great at explaining trade-offs."],
    execution: ["Always delivers on time.", "Gets things done without drama."],
    emotional_intelligence: ["Can be defensive when challenged in a meeting.", "Kind and supportive one-on-one."],
  } as Record<string, string[]>,
};

async function main() {
  const framework = await syncFramework(db, CORE_360);
  const full = await db.framework.findUniqueOrThrow({
    where: { id: framework.id },
    include: { competencies: { include: { questions: true }, orderBy: { order: "asc" } } },
  });

  await db.user.deleteMany({ where: { email: DEMO_EMAIL } });
  await db.rateLimit.deleteMany(); // fresh counters for demos and e2e runs
  const user = await db.user.create({
    data: {
      email: DEMO_EMAIL,
      name: "Alex Morgan",
      emailVerified: new Date(),
      profile: {
        create: {
          displayName: "Alex Morgan",
          jobTitle: "Senior Product Manager",
          seniority: "Senior",
          industry: "Software",
          goals: ["promotion", "leadership_growth"],
          onboardedAt: new Date(),
          aiCredits: 3,
        },
      },
    },
  });

  const questions = full.competencies.flatMap((c) =>
    c.questions
      .sort((a, b) => a.order - b.order)
      .map((q) => ({ competencyKey: c.key, competency: c.name, questionKey: q.key, text: q.text, selfText: q.selfText })),
  );

  // ---------------- Closed 360 with 12 raters ----------------
  const DAY = 86400000;
  const launched = new Date(Date.now() - 75 * DAY);
  const a = await db.assessment.create({
    data: {
      subjectId: user.id,
      frameworkId: full.id,
      title: "Pre-promotion 360 — Autumn 2026",
      goal: "promotion",
      status: "CLOSED",
      sessionLabel: "Baseline",
      inviteMessage: DEFAULT_INVITE_MESSAGE("Alex"),
      showManagerSeparately: true,
      dueAt: new Date(launched.getTime() + 14 * DAY),
      selfLockedAt: new Date(launched.getTime() - DAY),
      launchedAt: launched,
      closedAt: new Date(launched.getTime() + 15 * DAY),
      questions: { create: questions.map((q, i) => ({ ...q, order: i })) },
    },
    include: { questions: true },
  });
  const groupsDef: { kind: RaterGroupKind; name: string; raters: string[] }[] = [
    { kind: "SELF", name: "Self", raters: [] },
    { kind: "MANAGER", name: "Manager", raters: ["Jordan Lee"] },
    { kind: "PEER", name: "Peers", raters: ["Sam Patel", "Riya Kapoor", "Chris Novak", "Dana Brooks"] },
    { kind: "DIRECT_REPORT", name: "Direct reports", raters: ["Mia Chen", "Leo Garcia", "Noah Kim", "Ava Rossi"] },
    { kind: "CLIENT", name: "Clients", raters: ["Priya Iyer", "Tom Becker", "Elena Souza"] },
  ];
  const groups = [];
  for (const [i, g] of groupsDef.entries()) {
    groups.push({ ...(await db.raterGroup.create({ data: { assessmentId: a.id, kind: g.kind, name: g.name, order: i } })), raters: g.raters });
  }

  const qByComp = (key: string) => a.questions.filter((q) => q.competencyKey === key).sort((x, y) => x.order - y.order);

  // Self
  await db.submission.create({
    data: {
      assessmentId: a.id,
      raterGroupId: groups[0].id,
      isSelf: true,
      submittedOn: a.selfLockedAt!,
      responses: {
        create: Object.entries(SELF).flatMap(([key, vals]) => qByComp(key).map((q, i) => ({ assessmentQuestionId: q.id, value: vals[i] }))),
      },
    },
  });

  // Others
  const used = new Set<string>();
  /** Each canned comment is used at most once, so the demo has no duplicate quotes. */
  const take = (pool: string[]): string | null => {
    const fresh = pool.filter((p) => !used.has(p));
    if (!fresh.length) return null;
    const t = pick(fresh);
    used.add(t);
    return t;
  };
  for (const g of groups.slice(1)) {
    for (const raterName of g.raters) {
      const id = randomUUID();
      const [first, last] = raterName.split(" ");
      await db.raterInvite.create({
        data: {
          id,
          assessmentId: a.id,
          raterGroupId: g.id,
          name: raterName,
          email: `${first}.${last}@example.com`.toLowerCase(),
          tokenHash: hashToken(derivedToken("invite", id)),
          status: "SUBMITTED",
          invitedAt: launched,
          startedAt: launched,
          submittedAt: new Date(launched.getTime() + Math.floor(rand() * 10) * DAY),
        },
      });
      const raterBias = normal() * 0.3;
      const responses = a.questions.map((q) => {
        const bias = GROUP_BIAS[g.kind] ?? {};
        const mu =
          OTHERS_BASE[q.competencyKey] +
          (QUESTION_OFFSET[`${q.competencyKey}.${q.questionKey}`] ?? 0) +
          (bias[q.competencyKey] ?? 0) +
          (bias[`${q.competencyKey}.${q.questionKey}`] ?? 0) +
          raterBias;
        const dontKnow = g.kind === "CLIENT" ? rand() < 0.08 : rand() < 0.03;
        return { assessmentQuestionId: q.id, value: dontKnow ? null : clamp(mu + normal() * 0.5) };
      });
      const comments: { kind: "START" | "STOP" | "CONTINUE" | "GENERAL" | "COMPETENCY"; text: string; competencyKey?: string; assessmentQuestionId?: string }[] = [];
      for (const kind of ["START", "STOP", "CONTINUE"] as const) {
        const text = rand() < 0.8 ? take(COMMENTS[kind]) : null;
        if (text) comments.push({ kind, text });
      }
      const general = rand() < 0.5 ? take(COMMENTS.GENERAL) : null;
      if (general) comments.push({ kind: "GENERAL", text: general });
      if (rand() < 0.7) {
        const key = pick(Object.keys(COMMENTS.COMPETENCY));
        const text = take(COMMENTS.COMPETENCY[key]);
        if (text) comments.push({ kind: "COMPETENCY", competencyKey: key, assessmentQuestionId: qByComp(key)[0].id, text });
      }
      await db.submission.create({
        data: {
          assessmentId: a.id,
          raterGroupId: g.id,
          submittedOn: new Date(launched.getTime() + 5 * DAY),
          responses: { create: responses },
          comments: { create: comments },
        },
      });
    }
  }
  await buildAndStoreReport(a.id);
  await db.creditLedger.create({ data: { userId: user.id, delta: 3, reason: "grant", ref: "seed" } });

  // ---------------- Pulse check 1, a month later (communication improving) ----------------
  const rootReport = (await db.report.findFirstOrThrow({ where: { assessmentId: a.id } })).data as unknown as {
    competencies: { key: string; others: { mean: number | null } }[];
  };
  await db.goal.create({
    data: {
      userId: user.id,
      assessmentId: a.id,
      competencyKey: "communication",
      competencyName: "Communication",
      title: "Raise communication to 3.6",
      baseline: rootReport.competencies.find((c) => c.key === "communication")!.others.mean,
      target: 3.6,
      createdAt: new Date(a.closedAt!.getTime() + DAY),
    },
  });
  const pulseLaunch = new Date(Date.now() - 20 * DAY);
  const PULSE_KEYS = ["communication.clarity", "communication.listening", "communication.adapts", "communication.informs", "emotional_intelligence.composure", "emotional_intelligence.safety", "leadership.delegates"];
  const IMPROVE: Record<string, number> = { communication: 0.45, emotional_intelligence: 0.2, leadership: 0.3 };
  const pulseQs = a.questions.filter((q) => PULSE_KEYS.includes(`${q.competencyKey}.${q.questionKey}`)).sort((x, y) => x.order - y.order);
  const pulse = await db.assessment.create({
    data: {
      subjectId: user.id,
      frameworkId: full.id,
      type: "PULSE",
      rootAssessmentId: a.id,
      sessionNumber: 2,
      sessionLabel: "1-month check-in",
      title: `${a.title} · S2 Pulse check`,
      goal: "promotion",
      status: "CLOSED",
      inviteMessage: "Quick check-in on what's changed — about 2 minutes. — Alex",
      showManagerSeparately: true,
      dueAt: new Date(pulseLaunch.getTime() + 7 * DAY),
      selfLockedAt: new Date(pulseLaunch.getTime() - 3600_000),
      launchedAt: pulseLaunch,
      closedAt: new Date(pulseLaunch.getTime() + 8 * DAY),
      questions: { create: pulseQs.map((q, i) => ({ competencyKey: q.competencyKey, competency: q.competency, questionKey: q.questionKey, text: q.text, selfText: q.selfText, order: i })) },
      raterGroups: { create: groupsDef.map((g, i) => ({ kind: g.kind, name: g.name, order: i })) },
    },
    include: { questions: true, raterGroups: true },
  });
  const pulseGroup = (kind: RaterGroupKind) => pulse.raterGroups.find((g) => g.kind === kind)!;
  await db.submission.create({
    data: {
      assessmentId: pulse.id,
      raterGroupId: pulseGroup("SELF").id,
      isSelf: true,
      submittedOn: pulse.selfLockedAt!,
      responses: { create: pulse.questions.map((q) => ({ assessmentQuestionId: q.id, value: q.competencyKey === "communication" ? 4 : 4 })) },
    },
  });
  for (const g of groupsDef.slice(1)) {
    for (const raterName of g.raters) {
      const id = randomUUID();
      const [first, last] = raterName.split(" ");
      await db.raterInvite.create({
        data: {
          id,
          assessmentId: pulse.id,
          raterGroupId: pulseGroup(g.kind).id,
          name: raterName,
          email: `${first}.${last}@example.com`.toLowerCase(),
          tokenHash: hashToken(derivedToken("invite", id)),
          status: "SUBMITTED",
          invitedAt: pulseLaunch,
          submittedAt: new Date(pulseLaunch.getTime() + 3 * DAY),
        },
      });
      const raterBias = normal() * 0.3;
      await db.submission.create({
        data: {
          assessmentId: pulse.id,
          raterGroupId: pulseGroup(g.kind).id,
          submittedOn: new Date(pulseLaunch.getTime() + 3 * DAY),
          responses: {
            create: pulse.questions.map((q) => {
              const bias = GROUP_BIAS[g.kind] ?? {};
              const mu =
                OTHERS_BASE[q.competencyKey] +
                (IMPROVE[q.competencyKey] ?? 0) +
                (QUESTION_OFFSET[`${q.competencyKey}.${q.questionKey}`] ?? 0) +
                (bias[q.competencyKey] ?? 0) +
                (bias[`${q.competencyKey}.${q.questionKey}`] ?? 0) +
                raterBias;
              return { assessmentQuestionId: q.id, value: clamp(mu + normal() * 0.5) };
            }),
          },
        },
      });
    }
  }
  await buildAndStoreReport(pulse.id);

  // ---------------- Session 3: the full survey run again (every statement comparable) ----------------
  const rerunLaunch = new Date(Date.now() - 9 * DAY);
  const IMPROVE3: Record<string, number> = { communication: 0.5, emotional_intelligence: 0.3, leadership: 0.25, strategic_thinking: 0.1 };
  const rerun = await db.assessment.create({
    data: {
      subjectId: user.id,
      frameworkId: full.id,
      type: "FULL_360",
      rootAssessmentId: a.id,
      sessionNumber: 3,
      sessionLabel: "Winter re-run",
      title: a.title,
      goal: "promotion",
      status: "CLOSED",
      inviteMessage: a.inviteMessage,
      showManagerSeparately: true,
      dueAt: new Date(rerunLaunch.getTime() + 7 * DAY),
      selfLockedAt: new Date(rerunLaunch.getTime() - 3600_000),
      launchedAt: rerunLaunch,
      closedAt: new Date(rerunLaunch.getTime() + 6 * DAY),
      questions: { create: a.questions.map((q) => ({ competencyKey: q.competencyKey, competency: q.competency, questionKey: q.questionKey, text: q.text, selfText: q.selfText, order: q.order })) },
      raterGroups: { create: groupsDef.map((g, i) => ({ kind: g.kind, name: g.name, order: i })) },
    },
    include: { questions: true, raterGroups: true },
  });
  const rerunGroup = (kind: RaterGroupKind) => rerun.raterGroups.find((g) => g.kind === kind)!;
  await db.submission.create({
    data: {
      assessmentId: rerun.id,
      raterGroupId: rerunGroup("SELF").id,
      isSelf: true,
      submittedOn: rerun.selfLockedAt!,
      responses: { create: rerun.questions.map((q) => ({ assessmentQuestionId: q.id, value: q.competencyKey === "strategic_thinking" ? 4 : 4 })) },
    },
  });
  for (const g of groupsDef.slice(1)) {
    for (const raterName of g.raters) {
      const id = randomUUID();
      const [first, last] = raterName.split(" ");
      await db.raterInvite.create({
        data: {
          id,
          assessmentId: rerun.id,
          raterGroupId: rerunGroup(g.kind).id,
          name: raterName,
          email: `${first}.${last}@example.com`.toLowerCase(),
          tokenHash: hashToken(derivedToken("invite", id)),
          status: "SUBMITTED",
          invitedAt: rerunLaunch,
          submittedAt: new Date(rerunLaunch.getTime() + 2 * DAY),
        },
      });
      const raterBias = normal() * 0.3;
      await db.submission.create({
        data: {
          assessmentId: rerun.id,
          raterGroupId: rerunGroup(g.kind).id,
          submittedOn: new Date(rerunLaunch.getTime() + 2 * DAY),
          responses: {
            create: rerun.questions.map((q) => {
              const bias = GROUP_BIAS[g.kind] ?? {};
              const mu =
                OTHERS_BASE[q.competencyKey] +
                (IMPROVE3[q.competencyKey] ?? 0) +
                (QUESTION_OFFSET[`${q.competencyKey}.${q.questionKey}`] ?? 0) +
                (bias[q.competencyKey] ?? 0) +
                (bias[`${q.competencyKey}.${q.questionKey}`] ?? 0) +
                raterBias;
              const dontKnow = g.kind === "CLIENT" ? rand() < 0.08 : rand() < 0.03;
              return { assessmentQuestionId: q.id, value: dontKnow ? null : clamp(mu + normal() * 0.5) };
            }),
          },
        },
      });
    }
  }
  await buildAndStoreReport(rerun.id);
  await db.assessment.update({
    where: { id: a.id },
    data: { cadenceMonths: 1, nextPulseDueAt: new Date(rerunLaunch.getTime() + 30 * DAY) },
  });

  // ---------------- 360 in progress ----------------
  const b = await db.assessment.create({
    data: {
      subjectId: user.id,
      frameworkId: full.id,
      title: "Leadership check-in — Winter 2026",
      goal: "leadership_growth",
      status: "COLLECTING",
      inviteMessage: DEFAULT_INVITE_MESSAGE("Alex"),
      dueAt: new Date(Date.now() + 10 * DAY),
      selfLockedAt: new Date(Date.now() - 4 * DAY),
      launchedAt: new Date(Date.now() - 3 * DAY),
      questions: { create: questions.map((q, i) => ({ ...q, order: i })) },
      raterGroups: { create: [{ kind: "SELF", name: "Self", order: 0 }] },
    },
    include: { questions: true, raterGroups: true },
  });
  await db.submission.create({
    data: {
      assessmentId: b.id,
      raterGroupId: b.raterGroups[0].id,
      isSelf: true,
      submittedOn: b.selfLockedAt!,
      responses: { create: b.questions.map((q) => ({ assessmentQuestionId: q.id, value: 4 })) },
    },
  });
  const peers = await db.raterGroup.create({ data: { assessmentId: b.id, kind: "PEER", name: "Peers", order: 1 } });
  const reports = await db.raterGroup.create({ data: { assessmentId: b.id, kind: "DIRECT_REPORT", name: "Direct reports", order: 2 } });
  const pending: [string, string, "INVITED" | "STARTED" | "SUBMITTED"][] = [
    [peers.id, "Sam Patel", "SUBMITTED"],
    [peers.id, "Riya Kapoor", "STARTED"],
    [peers.id, "Chris Novak", "INVITED"],
    [reports.id, "Mia Chen", "SUBMITTED"],
    [reports.id, "Leo Garcia", "INVITED"],
    [reports.id, "Noah Kim", "INVITED"],
  ];
  for (const [groupId, name, status] of pending) {
    const id = randomUUID();
    const [first, last] = name.split(" ");
    await db.raterInvite.create({
      data: {
        id,
        assessmentId: b.id,
        raterGroupId: groupId,
        name,
        email: `${first}.${last}@example.com`.toLowerCase(),
        tokenHash: hashToken(derivedToken("invite", id)),
        status,
        invitedAt: new Date(Date.now() - 3 * DAY),
      },
    });
    if (status === "SUBMITTED") {
      await db.submission.create({
        data: {
          assessmentId: b.id,
          raterGroupId: groupId,
          submittedOn: new Date(Date.now() - 2 * DAY),
          responses: { create: b.questions.map((q) => ({ assessmentQuestionId: q.id, value: clamp(3.8 + normal() * 0.7) })) },
        },
      });
    }
  }

  // Print a working rater link for manual testing of the rater form.
  const open = await db.raterInvite.findFirst({ where: { assessmentId: b.id, status: "INVITED" } });
  console.log(`Seeded demo subject ${DEMO_EMAIL}`);
  console.log(`  closed 360:     /assessments/${a.id}/report`);
  console.log(`  pulse check:    /assessments/${pulse.id}/report  (progress: /progress)`);
  console.log(`  full re-run:    /assessments/${rerun.id}/report`);
  console.log(`  collecting 360: /assessments/${b.id}`);
  if (open) console.log(`  rater link (${open.name}): /r/${derivedToken("invite", open.id)}`);
}

main()
  .then(() => db.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await db.$disconnect();
    process.exit(1);
  });

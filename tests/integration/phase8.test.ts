/** Phase 8 against a real database: benchmarks, dashboards, NL questions, scheduled emails and the read API. */
import { describe, expect, it, vi } from "vitest";

const hasDb = !!process.env.TEST_DATABASE_URL;
vi.spyOn(console, "info").mockImplementation(() => {});
vi.spyOn(console, "warn").mockImplementation(() => {});

describe.skipIf(!hasDb)("analytics v2 (integration)", async () => {
  const { db } = await import("@/lib/db");
  const bench = await import("@/lib/services/benchmarks");
  const dash = await import("@/lib/services/dashboards");
  const tokens = await import("@/lib/services/api-tokens");
  const svc = await import("@/lib/services/assessments");
  const raters = await import("@/lib/services/raters");
  const { derivedToken } = await import("@/lib/tokens");
  const { syncFramework } = await import("@/lib/frameworks/sync");
  const { CORE_360 } = await import("@/lib/frameworks/core-360");
  const { GET: apiSessions } = await import("@/app/api/v1/sessions/route");
  const { GET: apiDashboard } = await import("@/app/api/v1/dashboards/[id]/route");

  const stamp = Date.now();
  const fw = await syncFramework(db, CORE_360);
  const full = await db.framework.findUniqueOrThrow({ where: { id: fw.id }, include: { competencies: { include: { questions: true } } } });
  const qs = full.competencies.flatMap((c) => c.questions.map((q) => ({ competencyKey: c.key, questionKey: q.key, text: q.text, selfText: q.selfText })));

  async function personWithReport(i: number, value: number, optOut = false) {
    const u = await db.user.create({ data: { email: `b${i}-${stamp}@test.local`, name: `B${i}`, profile: { create: { displayName: `B${i}`, seniority: "Senior", goals: ["promotion"], onboardedAt: new Date(), benchmarkOptOut: optOut } } } });
    const a = await svc.createAssessment(u.id, {
      title: "Bench",
      goal: "promotion",
      frameworkId: fw.id,
      questions: qs,
      groups: [{ kind: "PEER", name: "Peers", shareLink: false, raters: [1, 2, 3].map((k) => ({ name: `R${k}`, email: `r${k}-${i}-${stamp}@t.local` })) }],
      inviteMessage: "Please give me feedback, thank you.",
      dueAt: null,
      minRatersPerGroup: 3,
      showManagerSeparately: false,
    });
    const aq = await db.assessmentQuestion.findMany({ where: { assessmentId: a.id } });
    const ans = (v: number) => ({ ratings: Object.fromEntries(aq.map((q) => [q.id, v])), competencyComments: {}, start: "", stop: "", continue: "", general: "", deidentify: false });
    await svc.submitSelfAssessment(u.id, a.id, ans(4));
    await svc.launchAssessment(u.id, a.id);
    for (const inv of await db.raterInvite.findMany({ where: { assessmentId: a.id } })) await raters.submitRaterResponse(derivedToken("invite", inv.id), ans(value));
    await svc.closeAssessment(u.id, a.id);
    return { u, a };
  }

  const people: Awaited<ReturnType<typeof personWithReport>>[] = [];
  for (let i = 0; i < 31; i++) people.push(await personWithReport(i, [2, 3, 4, 5][i % 4]));
  const optedOut = await personWithReport(99, 5, true);
  const me = people[0];

  it("builds norms only from people who didn't opt out, and places a report in them", async () => {
    const r = await bench.rebuildNorms();
    expect(r.people).toBeGreaterThanOrEqual(31);
    const all = await db.benchmarkNorm.findFirstOrThrow({ where: { slice: "all", competencyKey: "communication" } });
    expect(all.n).toBe(r.people);
    // Opting out removes you from the norms after the next rebuild.
    const before = all.n;
    await db.subjectProfile.update({ where: { userId: people[1].u.id }, data: { benchmarkOptOut: true } });
    await bench.rebuildNorms();
    expect((await db.benchmarkNorm.findFirstOrThrow({ where: { slice: "all", competencyKey: "communication" } })).n).toBe(before - 1);
    void optedOut;
    const report = (await db.report.findFirstOrThrow({ where: { assessmentId: me.a.id } })).data as never;
    const b = await bench.benchmarkForReport(report, "Senior");
    expect(b.available).toBe(true);
    expect(b.rows[0].norm.slice).toBe("seniority:Senior");
    expect(b.rows[0].percentile).toBeGreaterThan(0);
  });

  it("builds personal dashboards and keeps them private to their owner", async () => {
    const d = await dash.createDashboard(me.u.id, { name: "Mine", scope: "PERSONAL" });
    let w = await dash.renderWidgets(d);
    expect(w.map((x) => x.widget.type)).toEqual(["latest_scores", "goals", "benchmarks"]);
    expect(w[0].data!.rows.length).toBe(7);
    expect(w[2].data!.columns).toContain("Percentile");
    await dash.addWidget(me.u.id, d.id, { type: "sessions" });
    await expect(dash.addWidget(me.u.id, d.id, { type: "org_strengths" })).rejects.toThrow(/doesn't fit/);
    await expect(dash.getDashboard(people[2].u.id, d.id)).rejects.toThrow(/Not found/);
    await expect(dash.createDashboard(me.u.id, { name: "Coachy", scope: "COACH" })).rejects.toThrow(/coach workspace/);
    await expect(dash.createDashboard(me.u.id, { name: "Org", scope: "ORG", orgId: "nope" })).rejects.toThrow();
    const fresh = await dash.getDashboard(me.u.id, d.id);
    w = await dash.renderWidgets(fresh);
    expect(w.at(-1)!.data!.rows[0][2]).toBe("CLOSED");
  });

  it("answers a plain-English question with a widget", async () => {
    const d = (await dash.listDashboards(me.u.id))[0];
    const r = await dash.askDashboard(me.u.id, d.id, "How do I compare to others like me?");
    expect(r.widget.type).toBe("benchmarks");
    expect(r.data?.rows.length).toBeGreaterThan(0);
    await expect(dash.askDashboard(me.u.id, d.id, "?")).rejects.toThrow(/Ask a question/);
  });

  it("emails scheduled dashboards on the chosen day, once", async () => {
    const d = (await dash.listDashboards(me.u.id))[0];
    const now = new Date();
    await dash.setSchedule(me.u.id, d.id, { schedule: "weekly", day: now.getUTCDay() });
    await expect(dash.setSchedule(me.u.id, d.id, { schedule: "monthly", day: null })).rejects.toThrow(/day of the month/);
    await dash.runScheduledDashboards(now);
    await dash.runScheduledDashboards(now);
    const mails = await db.notification.findMany({ where: { to: me.u.email!, template: "scheduled-dashboard" } });
    expect(mails).toHaveLength(1);
    expect(mails[0].body).toContain("Latest scores");
  });

  it("serves the read-only API with a personal token", async () => {
    const t = await tokens.createApiToken(me.u.id, "Sheets");
    const call = (h?: string) => apiSessions(new Request("http://x/api/v1/sessions", { headers: h ? { authorization: h } : {} }), { params: Promise.resolve({}) });
    expect((await call()).status).toBe(401);
    expect((await call("Bearer mrr_" + "x".repeat(43))).status).toBe(401);
    const ok = await call(`Bearer ${t.token}`);
    expect(ok.status).toBe(200);
    expect((await ok.json()).data[0]).toMatchObject({ status: "CLOSED" });
    const d = (await dash.listDashboards(me.u.id))[0];
    const dr = await apiDashboard(new Request("http://x", { headers: { authorization: `Bearer ${t.token}` } }), { params: Promise.resolve({ id: d.id }) });
    expect((await dr.json()).data.widgets.length).toBeGreaterThan(0);
    // Another person's dashboard is a 404, and a revoked token stops working.
    const other = await tokens.createApiToken(people[2].u.id, "Other");
    expect((await apiDashboard(new Request("http://x", { headers: { authorization: `Bearer ${other.token}` } }), { params: Promise.resolve({ id: d.id }) })).status).toBe(404);
    await tokens.revokeApiToken(me.u.id, t.id);
    expect((await call(`Bearer ${t.token}`)).status).toBe(401);
    expect((await db.apiToken.findUniqueOrThrow({ where: { id: t.id } })).tokenHash).not.toContain(t.token);
  });
});

/** Phase 9 against a real database: plan limits, simulated checkout, coach plans, org seats and the marketplace. */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const hasDb = !!process.env.TEST_DATABASE_URL;
vi.spyOn(console, "info").mockImplementation(() => {});

describe.skipIf(!hasDb)("payments and marketplace (integration)", async () => {
  const { db } = await import("@/lib/db");
  const billing = await import("@/lib/services/billing");
  const market = await import("@/lib/services/marketplace");
  const coach = await import("@/lib/services/coach");
  const org = await import("@/lib/services/org");
  const svc = await import("@/lib/services/assessments");
  const raters = await import("@/lib/services/raters");
  const pulses = await import("@/lib/services/pulses");
  const { derivedToken } = await import("@/lib/tokens");
  const { syncFramework } = await import("@/lib/frameworks/sync");
  const { CORE_360 } = await import("@/lib/frameworks/core-360");

  const stamp = Date.now();
  const mk = (p: string) => db.user.create({ data: { email: `${p}-${stamp}@test.local`, name: p, profile: { create: { displayName: `${p} Doe`, goals: [], onboardedAt: new Date() } } } });
  const fw = await syncFramework(db, CORE_360);
  const full = await db.framework.findUniqueOrThrow({ where: { id: fw.id }, include: { competencies: { include: { questions: true } } } });
  const qs = full.competencies.flatMap((c) => c.questions.map((q) => ({ competencyKey: c.key, questionKey: q.key, text: q.text, selfText: q.selfText })));
  const wizard = (title: string, n: number, tag: string) => ({
    title,
    goal: "self_awareness" as const,
    frameworkId: fw.id,
    questions: qs,
    groups: [{ kind: "PEER" as const, name: "Peers", shareLink: false, raters: Array.from({ length: n }, (_, i) => ({ name: `R${i}`, email: `${tag}${i}-${stamp}@t.local` })) }],
    inviteMessage: "Please give me feedback, thank you.",
    dueAt: null,
    minRatersPerGroup: 3,
    showManagerSeparately: false,
  });
  const pay = async (userId: string, product: Parameters<typeof billing.startCheckout>[1], ctx = {}) => {
    const c = await billing.startCheckout(userId, product, ctx);
    expect(c.url).toContain(`/billing/checkout/${c.paymentId}`);
    expect(await billing.completeStubPayment(userId, c.paymentId, true)).toBe("PAID");
    return c.paymentId;
  };

  beforeAll(() => {
    process.env.BILLING_ENFORCED = "true";
  });
  afterAll(() => {
    process.env.BILLING_ENFORCED = "false";
  });

  it("caps free 360s at 5 raters and unlocks with a full-360 purchase", async () => {
    const u = await mk("free");
    await expect(svc.createAssessment(u.id, wizard("Big", 6, "b"))).rejects.toThrow(/up to 5 raters/);
    const small = await svc.createAssessment(u.id, wizard("Small", 5, "s"));
    expect(small.unlockedAt).toBeNull();
    expect(await billing.isUnlocked(u.id, small)).toBe(false);
    const group = await db.raterGroup.findFirstOrThrow({ where: { assessmentId: small.id, kind: "PEER" } });
    await expect(svc.addRaters(u.id, small.id, group.id, [{ name: "X", email: `x-${stamp}@t.local` }])).rejects.toThrow(billing.UpgradeRequired);
    // Buying an unlock for this 360 lifts the cap and enables the PDF.
    const pid = await pay(u.id, "full_360", { assessmentId: small.id });
    expect(await billing.fulfill(pid)).toBe(false); // idempotent
    await svc.addRaters(u.id, small.id, group.id, [{ name: "X", email: `x-${stamp}@t.local` }]);
    const after = await db.assessment.findUniqueOrThrow({ where: { id: small.id } });
    expect(await billing.isUnlocked(u.id, after)).toBe(true);
    await expect(billing.startCheckout(u.id, "full_360", { assessmentId: small.id })).rejects.toThrow(/already unlocked/);
  });

  it("applies a prepaid unlock automatically and canceled checkouts deliver nothing", async () => {
    const u = await mk("prepaid");
    const c = await billing.startCheckout(u.id, "full_360");
    expect(await billing.completeStubPayment(u.id, c.paymentId, false)).toBe("CANCELED");
    await expect(svc.createAssessment(u.id, wizard("Big", 8, "p"))).rejects.toThrow(/up to 5/);
    await pay(u.id, "full_360");
    expect((await billing.billingOverview(u.id)).full360Unlocks).toBe(1);
    const a = await svc.createAssessment(u.id, wizard("Big", 8, "p"));
    expect(a.unlockedAt).not.toBeNull();
    expect((await billing.billingOverview(u.id)).full360Unlocks).toBe(0);
    // Someone else can't complete this person's checkout.
    const other = await mk("other");
    const c2 = await billing.startCheckout(u.id, "ai_credits_5");
    await expect(billing.completeStubPayment(other.id, c2.paymentId, true)).rejects.toThrow(/Not found/);
  });

  it("Pro: unlimited raters, extra credits, pulse limit lifted, subscription extends and cancels", async () => {
    const u = await mk("pro");
    expect(await billing.chatFeature(u.id)).toBe("chat");
    // Free: one pulse per survey.
    const a = await svc.createAssessment(u.id, wizard("Pulse root", 3, "q"));
    const aq = await db.assessmentQuestion.findMany({ where: { assessmentId: a.id }, orderBy: { order: "asc" } });
    const ans = (v: number) => ({ ratings: Object.fromEntries(aq.map((q) => [q.id, v])), competencyComments: {}, start: "", stop: "", continue: "", general: "", deidentify: false });
    await svc.submitSelfAssessment(u.id, a.id, ans(4));
    await svc.launchAssessment(u.id, a.id);
    for (const inv of await db.raterInvite.findMany({ where: { assessmentId: a.id } })) await raters.submitRaterResponse(derivedToken("invite", inv.id), ans(3));
    await svc.closeAssessment(u.id, a.id);
    const p1 = await pulses.createPulse(u.id, a.id, { questionIds: aq.slice(0, 5).map((q) => q.id) });
    await db.assessment.update({ where: { id: p1.id }, data: { status: "CLOSED" } });
    await expect(pulses.createPulse(u.id, a.id, { questionIds: aq.slice(0, 5).map((q) => q.id) })).rejects.toThrow(/1 pulse check/);

    const before = (await db.subjectProfile.findUniqueOrThrow({ where: { userId: u.id } })).aiCredits;
    await pay(u.id, "pro_yearly");
    await pay(u.id, "pro_yearly");
    const o = await billing.billingOverview(u.id);
    expect(o.plan).toBe("PRO");
    expect(o.credits).toBe(before + 6);
    expect(o.subscriptions).toHaveLength(1);
    expect(o.subscriptions[0].currentPeriodEnd.getTime()).toBeGreaterThan(Date.now() + 729 * 86400000);
    expect(await billing.chatFeature(u.id)).toBe("chat_pro");
    await pulses.createPulse(u.id, a.id, { questionIds: aq.slice(0, 5).map((q) => q.id) });
    expect((await svc.createAssessment(u.id, wizard("Huge", 12, "h"))).unlockedAt).not.toBeNull();
    // Canceling keeps access to the end of the period.
    await billing.cancelSubscription(u.id, o.subscriptions[0].id);
    expect(await billing.userPlan(u.id)).toBe("PRO");
    await db.subscription.updateMany({ where: { userId: u.id }, data: { currentPeriodEnd: new Date(Date.now() - 1000) } });
    expect(await billing.userPlan(u.id)).toBe("FREE");
  });

  it("coach plans: client caps, branding, report credits and gifting", async () => {
    const c = await mk("coach");
    await coach.saveCoachProfile(c.id, { displayName: "Coach Test" });
    expect(await billing.coachHasBranding(c.id)).toBe(false);
    for (let i = 0; i < 3; i++) await coach.inviteClient(c.id, `cl${i}-${stamp}@t.local`);
    await expect(coach.inviteClient(c.id, `cl3-${stamp}@t.local`)).rejects.toThrow(/covers 3 clients/);
    await pay(c.id, "coach_starter_month");
    expect(await billing.coachPlan(c.id)).toBe("COACH_STARTER");
    expect(await billing.coachHasBranding(c.id)).toBe(true);
    await coach.inviteClient(c.id, `cl3-${stamp}@t.local`);

    const client = await mk("client");
    await coach.inviteCoach(client.id, c.email!);
    const req = await db.coachClientLink.findFirstOrThrow({ where: { clientId: client.id, status: "PENDING" } });
    await coach.respondToInvite(c.id, req.id, true);
    await expect(billing.giftFull360(c.id, client.id)).rejects.toThrow(/no client report credits/);
    await pay(c.id, "coach_report_credits_5");
    await billing.giftFull360(c.id, client.id);
    expect((await billing.billingOverview(c.id)).reportCredits).toBe(4);
    expect((await billing.billingOverview(client.id)).full360Unlocks).toBe(1);
    const stranger = await mk("stranger");
    await expect(billing.giftFull360(c.id, stranger.id)).rejects.toThrow(/Not found/);
  });

  it("org rounds use one seat per participant; admins buy more", async () => {
    const admin = await mk("orgadmin");
    const orgId = (await org.createOrg(admin.id, `Seats ${stamp}`)).id;
    for (let i = 0; i < 11; i++) await db.orgMember.create({ data: { orgId, email: `m${i}-${stamp}@t.local`, name: `M${i}`, status: "ACTIVE" } });
    const round = { name: "Round", frameworkId: fw.id, teamMode: false, dueInDays: 14 };
    await expect(org.createCampaign(admin.id, orgId, round)).rejects.toThrow(/needs 12 seats and the organization has 10/);
    const member = await mk("member");
    await expect(billing.startCheckout(member.id, "org_seats_25", { orgId })).rejects.toThrow(/Only organization admins/);
    await pay(admin.id, "org_seats_25", { orgId });
    await org.createCampaign(admin.id, orgId, round);
    expect((await db.organization.findUniqueOrThrow({ where: { id: orgId } })).seats).toBe(23);
  });

  it("marketplace: paid plan to list, verified to appear, referral fee on accept", async () => {
    const c = await mk("listed");
    await coach.saveCoachProfile(c.id, { displayName: "Listed Coach" });
    const listing = { listed: true, headline: "Leadership coach", bio: "I coach leaders.", specialties: ["Leadership"], languages: ["English"], sessionPriceCents: 25000 };
    await expect(market.updateListing(c.id, listing)).rejects.toThrow(/Coach Starter or Coach Pro/);
    await pay(c.id, "coach_pro_month");
    await expect(market.updateListing(c.id, { ...listing, bio: "" })).rejects.toThrow(/headline and a short bio/);
    await market.updateListing(c.id, listing);
    expect((await market.listCoaches()).some((x) => x.id === c.id)).toBe(false); // not verified yet
    await db.coachProfile.update({ where: { userId: c.id }, data: { verified: true } });
    const found = await market.listCoaches({ specialty: "leadership", q: "coach" });
    expect(found.find((x) => x.id === c.id)).toMatchObject({ pro: true, sessionPriceCents: 25000 });
    expect(await market.listCoaches({ language: "Klingon" })).not.toContainEqual(expect.objectContaining({ id: c.id }));

    const client = await mk("seeker");
    const link = await market.requestIntro(client.id, c.id);
    expect((await market.coachReferrals(c.id)).refs[0]).toMatchObject({ status: "PENDING", feeCents: 2500 });
    await coach.respondToInvite(c.id, link.id, true);
    expect(await market.coachReferrals(c.id)).toMatchObject({ dueCents: 2500 });
    expect((await market.coachReferrals(c.id)).refs[0].status).toBe("ACCEPTED");
    // Unlisted or unverified coaches can't be requested.
    const hidden = await mk("hidden");
    await expect(market.requestIntro(client.id, hidden.id)).rejects.toThrow(/Not found/);
  });
});

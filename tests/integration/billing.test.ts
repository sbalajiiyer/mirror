/** Payments against a real database: credits (free first 360, charges at launch, top-ups with fees, discounts), coach plans, company rounds and the marketplace. */
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
  const pay = async (userId: string, product: Parameters<typeof billing.startCheckout>[1], ctx: Parameters<typeof billing.startCheckout>[2] = {}) => {
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

  const pricing = await import("@/lib/services/pricing");
  const credits = await import("@/lib/services/credits");
  const { topUpPrice } = await import("@/lib/billing/pricing");
  const { chargePremiumAI } = await import("@/lib/ai/context");
  const answers = async (assessmentId: string, v: number) => {
    const aq = await db.assessmentQuestion.findMany({ where: { assessmentId }, orderBy: { order: "asc" } });
    return { ratings: Object.fromEntries(aq.map((q) => [q.id, v])), competencyComments: {}, start: "", stop: "", continue: "", general: "", deidentify: false };
  };
  /** Self-assess and launch; returns the charge. */
  const launch = async (userId: string, id: string) => {
    await svc.submitSelfAssessment(userId, id, await answers(id, 4));
    return (await svc.launchAssessment(userId, id)).charge;
  };
  const finish = async (userId: string, id: string) => {
    for (const inv of await db.raterInvite.findMany({ where: { assessmentId: id } })) await raters.submitRaterResponse(derivedToken("invite", inv.id), await answers(id, 3));
    await svc.closeAssessment(userId, id);
  };
  const policy = await pricing.getPolicy();

  it("first 360 is free with unlimited raters; the next is charged in credits when invites go out", async () => {
    const u = await mk("free");
    const first = await svc.createAssessment(u.id, wizard("Big first", 9, "f"));
    expect(await launch(u.id, first.id)).toEqual({ kind: "free", price: 0 });
    expect((await db.assessment.findUniqueOrThrow({ where: { id: first.id } })).billing).toBe("FREE");

    const second = await svc.createAssessment(u.id, wizard("Second", 5, "g"));
    expect(await billing.launchQuote(second.id)).toMatchObject({ kind: "paid", price: policy.survey360, enough: false, balance: 0 });
    await svc.submitSelfAssessment(u.id, second.id, await answers(second.id, 4));
    await expect(svc.launchAssessment(u.id, second.id)).rejects.toThrow(credits.CreditsRequired);
    expect((await db.assessment.findUniqueOrThrow({ where: { id: second.id } })).status).toBe("READY");

    // Buy exactly what's needed; the buyer pays the fees on top.
    const n = policy.survey360 / 100;
    const c = await billing.startCheckout(u.id, "credits", { credits: n });
    const p = await db.payment.findUniqueOrThrow({ where: { id: c.paymentId } });
    expect(p.amountCents).toBe(topUpPrice(n, policy).totalCents);
    expect(p.amountCents).toBeGreaterThan(n * 100);
    expect(await billing.completeStubPayment(u.id, c.paymentId, true)).toBe("PAID");
    expect(await billing.fulfill(c.paymentId)).toBe(false); // idempotent
    expect(await credits.creditBalance(u.id)).toBe(policy.survey360);

    expect((await svc.launchAssessment(u.id, second.id)).charge).toEqual({ kind: "paid", price: policy.survey360 });
    expect(await credits.creditBalance(u.id)).toBe(0);
    const a = await db.assessment.findUniqueOrThrow({ where: { id: second.id } });
    expect([a.billing, a.chargedCredits]).toEqual(["PAID", policy.survey360]);
    const led = await credits.ledger(await credits.personalWorkspaceId(u.id));
    expect(led.map((l) => [l.reason, l.delta, l.balanceAfter])).toEqual([
      ["survey", -policy.survey360, 0],
      ["purchase", policy.survey360, policy.survey360],
    ]);
  });

  it("checkout rules: retired products, limits, someone else's payment, canceled checkouts", async () => {
    const u = await mk("checkout");
    await expect(billing.startCheckout(u.id, "full_360")).rejects.toThrow(/no longer sold/);
    await expect(billing.startCheckout(u.id, "credits", { credits: 0 })).rejects.toThrow(/whole number of credits/);
    await expect(billing.startCheckout(u.id, "credits", { credits: 2.5 })).rejects.toThrow(/whole number of credits/);
    await expect(billing.startCheckout(u.id, "credits", { credits: policy.maxTopUp + 1 })).rejects.toThrow(/whole number of credits/);
    const c = await billing.startCheckout(u.id, "credits", { credits: 10 });
    const other = await mk("other");
    await expect(billing.completeStubPayment(other.id, c.paymentId, true)).rejects.toThrow(/Not found/);
    expect(await billing.completeStubPayment(u.id, c.paymentId, false)).toBe("CANCELED");
    expect(await credits.creditBalance(u.id)).toBe(0);
  });

  it("follow-ups and pulses are priced from the policy; discounts apply; Pro is honored until it ends", async () => {
    const u = await mk("series");
    const root = await svc.createAssessment(u.id, wizard("Series", 5, "s"));
    await launch(u.id, root.id);
    await finish(u.id, root.id);
    const qs = await db.assessmentQuestion.findMany({ where: { assessmentId: root.id }, orderBy: { order: "asc" } });
    const pulse = await pulses.createPulse(u.id, root.id, { questionIds: qs.slice(0, 5).map((q) => q.id) });
    expect(await billing.launchQuote(pulse.id)).toMatchObject({ kind: "paid", reason: "pulse", price: policy.pulse });
    await credits.grantCredits(u.id, 100);
    expect(await launch(u.id, pulse.id)).toEqual({ kind: "paid", price: policy.pulse });
    expect(await credits.creditBalance(u.id)).toBe(10000 - policy.pulse);
    await db.assessment.update({ where: { id: pulse.id }, data: { status: "CLOSED" } });

    // A personal 50% discount on surveys halves the follow-up price; an AI-only discount doesn't.
    const admin = await mk("pricingadmin");
    await pricing.createDiscount(admin.id, { target: "user", who: u.email!, percent: 20, scope: "AI" });
    await pricing.createDiscount(admin.id, { target: "user", who: u.email!, percent: 50, scope: "SURVEYS" });
    const sessions = await import("@/lib/services/sessions");
    const again = await sessions.rerunSurvey(u.id, root.id, { reuseRaters: true, dueInDays: 14 });
    expect(await billing.launchQuote(again.id)).toMatchObject({ kind: "paid", reason: "follow_up", discount: 50, price: Math.round(policy.followUp / 2) });

    // Pro from before credits keeps surveys free until it ends.
    await db.subscription.create({ data: { userId: u.id, plan: "PRO", currentPeriodEnd: new Date(Date.now() + 86400000), provider: "stub" } });
    expect(await billing.chatFeature(u.id)).toBe("chat_pro");
    expect(await launch(u.id, again.id)).toEqual({ kind: "pro", price: 0 });
    expect(await credits.creditBalance(u.id)).toBe(10000 - policy.pulse);
  });

  it("coach plans: client caps and branding; gifting a 360 costs the coach credits", async () => {
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
    await expect(billing.giftFull360(c.id, client.id)).rejects.toThrow(/Gifting a 360 costs/);
    await credits.grantCredits(c.id, 50);
    await billing.giftFull360(c.id, client.id);
    expect(await credits.creditBalance(c.id)).toBe(5000 - policy.coachGift);
    expect((await billing.billingOverview(client.id)).giftedSurveys).toBe(1);
    // The client's free 360 comes first; the gift pays for the next one.
    const one = await svc.createAssessment(client.id, wizard("Client one", 5, "c1"));
    expect(await launch(client.id, one.id)).toEqual({ kind: "free", price: 0 });
    const two = await svc.createAssessment(client.id, wizard("Client two", 5, "c2"));
    expect(await launch(client.id, two.id)).toEqual({ kind: "voucher", price: 0 });
    expect((await billing.billingOverview(client.id)).giftedSurveys).toBe(0);
    const stranger = await mk("stranger");
    await expect(billing.giftFull360(c.id, stranger.id)).rejects.toThrow(/Not found/);
  });

  it("company rounds are paid from company credits, with the company's discount", async () => {
    const admin = await mk("orgadmin");
    const orgId = (await org.createOrg(admin.id, `Credits ${stamp}`)).id;
    const ws = await credits.companyWorkspaceId(orgId);
    expect(await credits.balance(ws)).toBe(policy.companyWelcomeCredits);
    for (let i = 0; i < 11; i++) await db.orgMember.create({ data: { orgId, email: `m${i}-${stamp}@t.local`, name: `M${i}`, status: "ACTIVE" } });
    const round = { name: "Round", frameworkId: fw.id, teamMode: false, dueInDays: 14 };
    const cost = 12 * policy.companyParticipant;
    await expect(org.createCampaign(admin.id, orgId, round)).rejects.toThrow(/The company has/);
    expect(await db.orgCampaign.count({ where: { orgId } })).toBe(0); // nothing half-created
    const member = await mk("member");
    await expect(billing.startCheckout(member.id, "credits", { orgId, credits: 50 })).rejects.toThrow(/Only organization owners/);
    const need = Math.ceil((cost - policy.companyWelcomeCredits) / 100);
    await pay(admin.id, "credits", { orgId, credits: need });
    expect(await credits.creditBalance(admin.id)).toBe(0); // went to the company, not the person
    await org.createCampaign(admin.id, orgId, round);
    const left = policy.companyWelcomeCredits + need * 100 - cost;
    expect(await credits.balance(ws)).toBe(left);

    const pa = await mk("pa");
    await pricing.createDiscount(pa.id, { target: "org", who: orgId, percent: 25, scope: "SURVEYS" });
    expect((await billing.roundQuote(orgId, 12)).total).toBe(12 * Math.round(policy.companyParticipant * 0.75));
    // An expired discount doesn't count.
    await pricing.createDiscount(pa.id, { target: "org", who: orgId, percent: 90, scope: "ALL", startsAt: "2020-01-01", endsAt: "2020-02-01" });
    expect(await pricing.orgDiscount(orgId, "SURVEYS")).toBe(25);
  });

  it("pricing policy edits are validated and audited; premium AI is charged at cost x markup", async () => {
    const admin = await mk("policyadmin");
    await expect(pricing.updatePolicy(admin.id, { ...policy, premiumMarkupPct: 50 })).rejects.toThrow(/below cost/);
    const { updatedAt: _u, ...values } = policy;
    void _u;
    const changed = await pricing.updatePolicy(admin.id, { ...values, pulse: policy.pulse + 100 });
    expect(changed).toEqual({ pulse: { from: policy.pulse, to: policy.pulse + 100 } });
    expect((await pricing.getPolicy()).pulse).toBe(policy.pulse + 100);
    expect(await db.auditLog.count({ where: { actorId: admin.id, action: "pricing.update" } })).toBe(1);
    await pricing.updatePolicy(admin.id, values);

    const u = await mk("premium");
    await credits.grantCredits(u.id, 1);
    // 12,345 micro-dollars x 2 = 2.469 cents → 3 hundredths of a credit.
    expect(await chargePremiumAI({ workspaceId: null, userId: u.id, costMicros: 12_345, feature: "chat_premium" })).toBe(3);
    expect(await credits.creditBalance(u.id)).toBe(97);
    // Never below zero.
    expect(await chargePremiumAI({ workspaceId: null, userId: u.id, costMicros: 10_000_000, feature: "chat_premium" })).toBe(97);
    expect(await credits.creditBalance(u.id)).toBe(0);
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

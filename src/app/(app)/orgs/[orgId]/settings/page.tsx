import { adminPage, or404 } from "@/lib/org/page-guard";
import { db } from "@/lib/db";
import { ssoSettings } from "@/lib/services/sso";
import { REGIONS, isRegion } from "@/lib/residency";
import { aiCatalog } from "@/lib/ai/models";
import { orgAiUsage } from "@/lib/services/org-settings";
import { formatCents } from "@/lib/billing/catalog";
import { OrgNav } from "@/components/org/org-nav";
import { OrgAiForm, OrgDataForm, SsoConfigForm, SsoDomainForm, VerifyDomainButton } from "@/components/org/org-settings-forms";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata = { title: "Organization settings" };

export default async function OrgSettingsPage({ params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params;
  const { user } = await adminPage(orgId, "/settings", "OWNER");
  const org = await db.organization.findUniqueOrThrow({ where: { id: orgId } });
  const sso = await or404(ssoSettings(user.id, orgId));
  const usage = await or404(orgAiUsage(user.id, orgId));
  const region = REGIONS[isRegion(org.region) ? org.region : "us"];
  return (
    <div className="space-y-6">
      <OrgNav orgId={orgId} orgName={org.name} active="settings" />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            Data residency and retention <Badge variant="secondary" data-testid="org-region">{region.label}</Badge>
          </CardTitle>
          <CardDescription>
            <span className="block">Where data is stored: {region.storage}.</span>
            <span className="block">AI: {region.ai}.</span>
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <OrgDataForm orgId={orgId} initial={{ region: org.region, retentionMonths: org.retentionMonths, allowPersonalCopy: org.allowPersonalCopy }} />
          <p className="text-xs text-muted-foreground">
            Retention applies to 360s in this organization&apos;s rounds. When the period passes, individual answers and written comments are deleted; each
            person keeps their report scores, themes and trends.
          </p>
        </CardContent>
      </Card>

      <Card data-testid="ai-card">
        <CardHeader>
          <CardTitle className="text-base">AI models</CardTitle>
          <CardDescription>
            The free model is always available. Premium models are charged per use; turn on the ones people here may use. Anyone who picked a model that isn&apos;t
            allowed gets the free model in this workspace.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <OrgAiForm
            orgId={orgId}
            models={aiCatalog()
              .filter((m) => m.tier === "premium" && m.available)
              .map((m) => ({ id: m.id, label: m.label, description: m.description }))}
            allowed={org.allowedAiModels}
            budgetCents={org.aiBudgetCents}
            perPersonCents={org.aiPerPersonCents}
          />
          <AiUsage usage={usage} />
        </CardContent>
      </Card>

      <Card data-testid="sso-card">
        <CardHeader>
          <CardTitle className="flex flex-wrap items-center gap-2 text-base">
            Single sign-on (OIDC)
            {sso.enabled ? <Badge>On{sso.required ? " · required" : ""}</Badge> : <Badge variant="outline">Off</Badge>}
          </CardTitle>
          <CardDescription>
            Works with Okta, Microsoft Entra ID, Google Workspace, Auth0, OneLogin, JumpCloud and other OpenID Connect providers. People who sign in this way
            join the organization automatically.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <section className="space-y-3">
            <h2 className="text-sm font-medium">1. Prove you own the email domain</h2>
            <SsoDomainForm orgId={orgId} domain={sso.domain} />
            {sso.domain && (
              <div className="space-y-2 text-sm">
                {sso.verified ? (
                  <p data-testid="domain-verified">
                    <Badge variant="secondary">Verified</Badge> {sso.domain}
                  </p>
                ) : (
                  <>
                    <p>
                      Add this TXT record to <strong>{sso.domain}</strong> (or to <code>_mirror.{sso.domain}</code>):
                    </p>
                    <pre className="overflow-x-auto rounded-md bg-muted p-2 text-xs">{sso.verifyRecord}</pre>
                    <VerifyDomainButton orgId={orgId} />
                  </>
                )}
              </div>
            )}
          </section>
          <section className="space-y-3">
            <h2 className="text-sm font-medium">2. Connect your identity provider</h2>
            <p className="text-sm text-muted-foreground">
              Create an OIDC web application in your provider with the redirect URI{" "}
              <code className="break-all rounded bg-muted px-1" data-testid="sso-redirect">
                {sso.redirectUri}
              </code>{" "}
              and the scopes <code>openid email profile</code>.
            </p>
            <SsoConfigForm orgId={orgId} verified={sso.verified} initial={{ issuer: sso.issuer ?? "", clientId: sso.clientId ?? "", hasSecret: sso.hasSecret, enabled: sso.enabled, required: sso.required }} />
          </section>
        </CardContent>
      </Card>
    </div>
  );
}

function AiUsage({ usage }: { usage: Awaited<ReturnType<typeof orgAiUsage>> }) {
  return (
    <div className="mt-6 space-y-2 border-t pt-4 text-sm" data-testid="ai-usage">
      <p className="font-medium">
        Premium AI this month: {formatCents(usage.totalCents)}
        {usage.budgetCents != null && ` of ${formatCents(usage.budgetCents)}`}
      </p>
      {usage.people.length === 0 ? (
        <p className="text-muted-foreground">No premium AI used yet this month.</p>
      ) : (
        <ul className="divide-y">
          {usage.people.map((p) => (
            <li key={p.userId} className="flex justify-between py-1.5">
              <span>{p.name}</span>
              <span className="tabular-nums">
                {formatCents(p.cents)}
                {usage.perPersonCents != null && <span className="text-muted-foreground"> / {formatCents(usage.perPersonCents)}</span>}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

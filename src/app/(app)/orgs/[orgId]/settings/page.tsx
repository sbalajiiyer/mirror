import { adminPage, or404 } from "@/lib/org/page-guard";
import { db } from "@/lib/db";
import { ssoSettings } from "@/lib/services/sso";
import { REGIONS, isRegion } from "@/lib/residency";
import { OrgNav } from "@/components/org/org-nav";
import { OrgDataForm, SsoConfigForm, SsoDomainForm, VerifyDomainButton } from "@/components/org/org-settings-forms";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata = { title: "Organization settings" };

export default async function OrgSettingsPage({ params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params;
  const { user } = await adminPage(orgId, "/settings");
  const org = await db.organization.findUniqueOrThrow({ where: { id: orgId } });
  const sso = await or404(ssoSettings(user.id, orgId));
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

import { adminPage, or404 } from "@/lib/org/page-guard";
import { db } from "@/lib/db";
import { companyCoaching } from "@/lib/services/company-coaching";
import { OrgNav } from "@/components/org/org-nav";
import { EndCoachingButton, OfferCoachingForm } from "@/components/org/company-coaching";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata = { title: "Company coaching" };

/** Phase 11e: coaching the company offers and pays for. Admins see who and the status, never content. */
export default async function OrgCoachingPage({ params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params;
  const { user, admin } = await adminPage(orgId, "/coaching");
  const links = await or404(companyCoaching(user.id, orgId));
  const members = await db.orgMember.findMany({ where: { orgId, status: "ACTIVE", userId: { not: null } }, orderBy: { name: "asc" }, select: { id: true, name: true, email: true } });
  return (
    <div className="space-y-6">
      <OrgNav orgId={orgId} orgName={admin.org.name} active="coaching" />
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Offer coaching</CardTitle>
          <CardDescription>
            The person decides whether to accept, then the coach is invited. The coach sees only what the person chooses to share. {admin.org.name} sees who is
            coached and the status, never what is discussed.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <OfferCoachingForm orgId={orgId} members={members.map((m) => ({ id: m.id, name: m.name || m.email }))} />
        </CardContent>
      </Card>
      <Card data-testid="company-coaching-list">
        <CardHeader>
          <CardTitle className="text-base">Coaching paid by {admin.org.name}</CardTitle>
        </CardHeader>
        <CardContent>
          {links.length === 0 ? (
            <p className="text-sm text-muted-foreground">No coaching offered yet.</p>
          ) : (
            <ul className="divide-y text-sm">
              {links.map((l) => (
                <li key={l.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <span>
                    <span className="font-medium">{l.person}</span> <span className="text-muted-foreground">with {l.coach}</span>
                  </span>
                  <span className="flex items-center gap-2">
                    <Badge variant={l.status === "Active" ? "success" : "secondary"}>{l.status}</Badge>
                    {l.open && <EndCoachingButton orgId={orgId} linkId={l.id} />}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

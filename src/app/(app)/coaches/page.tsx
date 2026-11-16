import Link from "next/link";
import { requireOnboardedUser } from "@/lib/session";
import { listCoaches } from "@/lib/services/marketplace";
import { formatCents } from "@/lib/billing/catalog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const metadata = { title: "Find a coach" };

export default async function CoachesPage({ searchParams }: { searchParams: Promise<{ q?: string; specialty?: string; language?: string }> }) {
  await requireOnboardedUser("/coaches");
  const sp = await searchParams;
  const all = await listCoaches();
  const coaches = await listCoaches({ q: sp.q, specialty: sp.specialty, language: sp.language });
  const specialties = [...new Set(all.flatMap((c) => c.specialties))].sort();
  const languages = [...new Set(all.flatMap((c) => c.languages))].sort();
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Find a coach</h1>
        <p className="text-muted-foreground">Verified coaches who work with 360 feedback. Requesting an intro shares nothing until you decide.</p>
      </div>
      <form className="grid gap-3 sm:grid-cols-[1fr_auto_auto_auto] sm:items-end" role="search">
        <div className="space-y-1.5">
          <Label htmlFor="mk-q">Search</Label>
          <Input id="mk-q" name="q" defaultValue={sp.q ?? ""} placeholder="e.g. new managers" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="mk-spec">Specialty</Label>
          <select id="mk-spec" name="specialty" defaultValue={sp.specialty ?? ""} className="h-10 rounded-md border border-input bg-background px-3 text-sm">
            <option value="">Any</option>
            {specialties.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="mk-lang">Language</Label>
          <select id="mk-lang" name="language" defaultValue={sp.language ?? ""} className="h-10 rounded-md border border-input bg-background px-3 text-sm">
            <option value="">Any</option>
            {languages.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </div>
        <Button type="submit" variant="outline">
          Filter
        </Button>
      </form>
      {coaches.length === 0 ? (
        <p className="text-sm text-muted-foreground">No coaches match yet.</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {coaches.map((c) => (
            <Card key={c.id} data-testid="coach-card">
              <CardHeader>
                <CardTitle className="flex flex-wrap items-center gap-2 text-base">
                  <Link href={`/coaches/${c.id}`} className="hover:underline">
                    {c.name}
                  </Link>
                  <Badge variant="secondary">Verified</Badge>
                </CardTitle>
                <CardDescription>{c.headline}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div className="flex flex-wrap gap-1">
                  {c.specialties.map((s) => (
                    <Badge key={s} variant="outline">
                      {s}
                    </Badge>
                  ))}
                </div>
                <p className="text-muted-foreground">
                  {c.languages.join(", ")}
                  {c.sessionPriceCents != null && ` · ${formatCents(c.sessionPriceCents)} per session`}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

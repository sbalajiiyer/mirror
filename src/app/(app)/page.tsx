import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function Home() {
  const session = await auth();
  if (session) redirect("/dashboard");
  const features = [
    ["Anonymous by design", "Results only appear once at least 3 people in a group respond. Answers are stored with no link to who gave them."],
    ["Self-assessment first", "You rate yourself before anyone else answers, and it's locked — so the gaps are honest."],
    ["Reports that explain", "Radar, blind spots, hidden strengths, a Johari window, heatmaps and themed comments — exportable as PDF."],
  ];
  return (
    <div className="space-y-16 py-6">
      <section className="mx-auto max-w-3xl text-center">
        <p className="mb-3 text-sm font-medium uppercase tracking-widest text-primary">360° feedback for anyone</p>
        <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">See yourself the way others do.</h1>
        <p className="mx-auto mt-5 max-w-xl text-lg text-muted-foreground">
          Invite your manager, peers, team and clients to give honest, anonymous feedback in under 10 minutes. Mirror turns it into a clear picture of your strengths and blind spots.
        </p>
        <div className="mt-8 flex justify-center gap-3">
          <Button asChild size="lg">
            <Link href="/signin">Start your 360 — free</Link>
          </Button>
        </div>
        <p className="mt-4 text-xs text-muted-foreground">Development feedback, not a performance or hiring tool.</p>
      </section>
      <section className="grid gap-4 sm:grid-cols-3">
        {features.map(([t, d]) => (
          <Card key={t}>
            <CardHeader>
              <CardTitle className="text-base">{t}</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">{d}</CardContent>
          </Card>
        ))}
      </section>
    </div>
  );
}

import Link from "next/link";
import { Plus, Sparkles } from "lucide-react";
import { db } from "@/lib/db";
import { requireOnboardedUser } from "@/lib/session";
import { AI_QUESTIONNAIRE_PRICE_CENTS, formatPrice } from "@/lib/questionnaire";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata = { title: "Questionnaires" };

export default async function QuestionnairesPage() {
  const user = await requireOnboardedUser("/questionnaires");
  const mine = await db.framework.findMany({
    where: { ownerId: user.id },
    orderBy: { updatedAt: "desc" },
    include: { competencies: { include: { _count: { select: { questions: true } } } }, _count: { select: { assessments: true } } },
  });
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Questionnaires</h1>
        <p className="text-muted-foreground">Use the built-in Mirror Core 360, build or import your own (Excel, CSV, Google or Microsoft Forms) for free, or have AI write one tailored to you.</p>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Plus className="size-4" /> Build or import your own
            </CardTitle>
            <CardDescription>Write your own sections and statements, or import them from Excel, CSV, Google Forms or Microsoft Forms. Free, as many as you like.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild>
              <Link href="/questionnaires/new">Start building</Link>
            </Button>
          </CardContent>
        </Card>
        <Card className="border-primary/40">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="size-4 text-primary" /> Generate with AI
            </CardTitle>
            <CardDescription>
              Describe what you want feedback on; AI writes a complete, behaviour-based questionnaire you can then edit. {formatPrice(AI_QUESTIONNAIRE_PRICE_CENTS)} (1 credit).
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap items-center gap-3">
            <Button asChild variant="outline">
              <Link href="/questionnaires/new?ai=1">Generate a questionnaire</Link>
            </Button>
            <span className="text-sm text-muted-foreground" data-testid="credit-balance">
              You have {user.profile.aiCredits} credit{user.profile.aiCredits === 1 ? "" : "s"}
            </span>
          </CardContent>
        </Card>
      </div>
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Your questionnaires</h2>
        {mine.length === 0 && <p className="text-sm text-muted-foreground">None yet.</p>}
        <div className="grid gap-3 md:grid-cols-2">
          {mine.map((f) => {
            const n = f.competencies.reduce((s, c) => s + c._count.questions, 0);
            return (
              <Link key={f.id} href={`/questionnaires/${f.id}`} className="group">
                <Card className="h-full transition-shadow group-hover:shadow-md">
                  <CardHeader>
                    <div className="flex items-start justify-between gap-2">
                      <CardTitle className="text-base">{f.name}</CardTitle>
                      <Badge variant={f.source === "ai" ? "default" : "secondary"}>{f.source === "ai" ? "AI-generated" : "Custom"}</Badge>
                    </div>
                    <CardDescription>
                      {f.competencies.length} sections · {n} statements{f._count.assessments ? ` · used in ${f._count.assessments} 360${f._count.assessments > 1 ? "s" : ""}` : ""}
                    </CardDescription>
                  </CardHeader>
                </Card>
              </Link>
            );
          })}
        </div>
      </section>
    </div>
  );
}

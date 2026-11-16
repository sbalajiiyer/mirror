import Link from "next/link";
import { Plus } from "lucide-react";
import { db } from "@/lib/db";
import { goalLabel } from "@/lib/constants";
import { requireOnboardedUser } from "@/lib/session";
import { StatusBadge } from "@/components/assessment/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";

export const metadata = { title: "My 360s" };

export default async function Dashboard() {
  const user = await requireOnboardedUser("/dashboard");
  const assessments = await db.assessment.findMany({
    where: { subjectId: user.id },
    orderBy: { createdAt: "desc" },
    include: { invites: { select: { status: true } } },
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Hi {user.profile.displayName.split(" ")[0]}</h1>
          <p className="text-muted-foreground">Your 360s, pulse checks and reports.</p>
        </div>
        <div className="flex gap-2">
        <Button asChild variant="outline">
          <Link href="/progress">Progress</Link>
        </Button>
        <Button asChild>
          <Link href="/assessments/new">
            <Plus /> New 360
          </Link>
        </Button>
        </div>
      </div>

      {assessments.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Start your first 360</CardTitle>
            <CardDescription>It takes about 5 minutes to set up. You&apos;ll rate yourself first, then invite the people around you.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild>
              <Link href="/assessments/new">Set up a 360</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {assessments.map((a) => {
            const total = a.invites.length;
            const done = a.invites.filter((i) => i.status === "SUBMITTED").length;
            return (
              <Link key={a.id} href={a.status === "CLOSED" ? `/assessments/${a.id}/report` : `/assessments/${a.id}`} className="group">
                <Card className="h-full transition-shadow group-hover:shadow-md">
                  <CardHeader>
                    <div className="flex items-start justify-between gap-3">
                      <CardTitle className="text-base leading-snug">{a.title}</CardTitle>
                      <StatusBadge status={a.status} />
                    </div>
                    <CardDescription>
                      {a.type === "PULSE" ? "Pulse check · " : ""}Goal: {goalLabel(a.goal)}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>
                        {done} of {total} responded
                      </span>
                      {a.dueAt && a.status === "COLLECTING" && <span>Due {a.dueAt.toLocaleDateString("en", { month: "short", day: "numeric" })}</span>}
                    </div>
                    <Progress value={total ? (done / total) * 100 : 0} aria-label="Response progress" />
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

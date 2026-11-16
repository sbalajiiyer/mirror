import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { db } from "@/lib/db";
import { requireOnboardedUser } from "@/lib/session";
import { listChats } from "@/lib/services/chat";
import { ROLEPLAY_PRESETS } from "@/lib/ai/features/chat";
import { aiCatalog, resolveModel } from "@/lib/ai/models";
import type { ReportData } from "@/lib/report/compute";
import { NewChatForms } from "@/components/chat/chat-ui";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata = { title: "AI coach" };

export default async function ChatHome({ searchParams }: { searchParams: Promise<{ report?: string }> }) {
  const user = await requireOnboardedUser("/chat");
  const { report } = await searchParams;
  const closed = await db.assessment.findMany({ where: { subjectId: user.id, status: "CLOSED" }, orderBy: { closedAt: "desc" }, include: { reports: { take: 1, orderBy: { generatedAt: "desc" }, select: { data: true } } } });
  const reports = closed.filter((a) => (a.reports[0]?.data as unknown as ReportData | undefined)?.anonymity.available).map((a) => ({ id: a.id, title: `${a.title} · S${a.sessionNumber}${a.sessionLabel ? ` ${a.sessionLabel}` : ""}` }));
  const chats = await listChats(user.id);
  const chosen = resolveModel(user.profile.aiModel);
  const premiumAny = aiCatalog().find((m) => m.tier === "premium" && m.available);
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">AI coach</h1>
        <p className="text-muted-foreground">Ask about your feedback, or practise a difficult conversation. Free, up to 30 messages a day.</p>
      </div>
      <Alert tone="info" className="flex items-start gap-2">
        <ShieldCheck className="mt-0.5 size-4 shrink-0" aria-hidden />
        <span>
          The coach sees only your own report&apos;s combined scores and themes, your goals and plan. It never knows who your raters are, and it doesn&apos;t diagnose or
          label personalities. Development feedback, not professional advice.
        </span>
      </Alert>
      <NewChatForms
        reports={reports}
        presets={ROLEPLAY_PRESETS.map((p) => ({ key: p.key, label: p.label }))}
        defaultReport={report}
        premium={{ available: chosen.tier === "premium" && !!premiumAny, credits: user.profile.aiCredits, label: chosen.tier === "premium" ? chosen.label : null }}
      />
      {chats.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Your conversations</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="divide-y rounded-lg border text-sm" data-testid="chat-list">
              {chats.map((c) => (
                <li key={c.id}>
                  <Link href={`/chat/${c.id}`} className="flex items-center justify-between gap-2 px-3 py-2 hover:bg-accent/50">
                    <span className="truncate">{c.title}</span>
                    <span className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
                      {c.mode === "ROLEPLAY" && <Badge variant="secondary">Role-play</Badge>}
                      {c.tier === "premium" && <Badge variant="outline">Premium</Badge>}
                      {c._count.messages} messages · {c.updatedAt.toLocaleDateString()}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

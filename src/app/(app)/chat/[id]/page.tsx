import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireOnboardedUser } from "@/lib/session";
import { getChat } from "@/lib/services/chat";
import { or404 } from "@/lib/org/page-guard";
import { ChatWindow } from "@/components/chat/chat-ui";
import { Badge } from "@/components/ui/badge";

export const metadata = { title: "AI coach" };
export const dynamic = "force-dynamic";

export default async function ChatPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireOnboardedUser(`/chat/${id}`);
  const c = await or404(getChat(user.id, id));
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <Link href="/chat" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden /> All conversations
      </Link>
      <div>
        <h1 className="text-xl font-semibold tracking-tight">{c.title}</h1>
        <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          {c.mode === "ROLEPLAY" ? <Badge variant="secondary">Role-play</Badge> : <span>{c.assessment ? `Using ${c.assessment.title}` : "Using your latest report"}</span>}
          {c.scenario && <span>The AI plays {c.scenario}.</span>}
          {c.tier === "premium" && <Badge variant="outline">Premium</Badge>}
        </p>
      </div>
      <ChatWindow chatId={c.id} mode={c.mode} initial={c.messages.map((m) => ({ id: m.id, role: m.role as "user" | "assistant", content: m.content, citations: m.citations }))} />
    </div>
  );
}

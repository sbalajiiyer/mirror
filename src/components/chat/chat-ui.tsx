"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { MessageSquareText, Send, Theater, Trash2 } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { deleteChatAction, startChatAction } from "@/app/(app)/chat/actions";

type Msg = { id: string; role: "user" | "assistant"; content: string; citations: string[] };

export function ChatWindow({ chatId, mode, initial }: { chatId: string; mode: "REPORT" | "ROLEPLAY"; initial: Msg[] }) {
  const [msgs, setMsgs] = useState<Msg[]>(initial);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const end = useRef<HTMLDivElement>(null);
  const router = useRouter();
  useEffect(() => {
    end.current?.scrollIntoView({ block: "end" });
  }, [msgs]);

  const [streaming, setStreaming] = useState(false);
  const send = (t: string) => {
    const body = t.trim();
    if (!body || streaming) return;
    setError(null);
    const tmp: Msg = { id: `tmp-${Date.now()}`, role: "user", content: body, citations: [] };
    const replyId = `a-${Date.now()}`;
    setMsgs((m) => [...m, tmp]);
    setText("");
    setStreaming(true);
    const fail = (msg: string) => {
      setMsgs((m) => m.filter((x) => x.id !== tmp.id && x.id !== replyId));
      setText(body);
      setError(msg);
    };
    start(async () => {
      try {
        const res = await fetch(`/api/chat/${chatId}/stream`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text: body }) });
        if (!res.ok || !res.body) return fail("Couldn't reach the AI coach. Please try again.");
        const reader = res.body.getReader();
        const dec = new TextDecoder();
        let buf = "";
        let started = false;
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += dec.decode(value, { stream: true });
          let i: number;
          while ((i = buf.indexOf("\n")) >= 0) {
            const line = buf.slice(0, i);
            buf = buf.slice(i + 1);
            if (!line.trim()) continue;
            const ev = JSON.parse(line) as { t: "delta"; v: string } | { t: "done"; citations: string[] } | { t: "error"; error: string };
            if (ev.t === "delta") {
              if (!started) {
                started = true;
                setMsgs((m) => [...m, { id: replyId, role: "assistant", content: ev.v, citations: [] }]);
              } else setMsgs((m) => m.map((x) => (x.id === replyId ? { ...x, content: x.content + ev.v } : x)));
            } else if (ev.t === "done") {
              setMsgs((m) => m.map((x) => (x.id === replyId ? { ...x, content: x.content.trimEnd(), citations: ev.citations } : x)));
            } else return fail(ev.error);
          }
        }
      } catch {
        fail("The connection dropped. Please try again.");
      } finally {
        setStreaming(false);
      }
    });
  };

  return (
    <div className="space-y-4">
      <ol className="space-y-3" aria-label="Conversation" aria-live="polite" aria-busy={streaming} data-testid="chat-messages">
        {msgs.length === 0 && (
          <li className="text-sm text-muted-foreground">
            {mode === "REPORT" ? "Ask anything about your feedback, e.g. “What should I work on first?” or “Why do others rate my communication lower than I do?”" : "Start the conversation as you would in real life. Type “feedback” at any point to get coaching on how it's going."}
          </li>
        )}
        {msgs.map((m) => (
          <li key={m.id} className={m.role === "user" ? "flex justify-end" : "flex justify-start"} data-testid={`msg-${m.role}`}>
            <div className={`max-w-[85%] rounded-2xl px-4 py-2 text-sm ${m.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted"}`}>
              <span className="sr-only">{m.role === "user" ? "You:" : "Coach:"}</span>
              <p className="whitespace-pre-wrap">{m.content}</p>
              {m.citations.length > 0 && (
                <p className="mt-2 flex flex-wrap gap-1" aria-label="Based on">
                  {m.citations.map((c) => (
                    <Badge key={c} variant="outline" className="bg-background font-normal">
                      {c}
                    </Badge>
                  ))}
                </p>
              )}
            </div>
          </li>
        ))}
        {streaming && msgs[msgs.length - 1]?.role === "user" && (
          <li className="text-sm text-muted-foreground" role="status">
            Thinking…
          </li>
        )}
      </ol>
      <div ref={end} />
      {error && <Alert tone="error">{error}</Alert>}
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          send(text);
        }}
      >
        <Label htmlFor="chat-input" className="sr-only">
          Your message
        </Label>
        <Textarea
          id="chat-input"
          rows={2}
          value={text}
          maxLength={2000}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send(text);
            }
          }}
          placeholder={mode === "REPORT" ? "Ask about your feedback…" : "Say it as you would…"}
        />
        <div className="flex flex-col gap-2">
          <Button type="submit" disabled={pending || !text.trim()} aria-label="Send">
            <Send />
          </Button>
        </div>
      </form>
      <div className="flex flex-wrap gap-2">
        {mode === "ROLEPLAY" && (
          <Button type="button" size="sm" variant="outline" disabled={pending} onClick={() => send("feedback")}>
            How am I doing?
          </Button>
        )}
        <Button type="button" size="sm" variant="ghost" onClick={() => confirm("Delete this conversation?") && start(async () => { await deleteChatAction(chatId); router.push("/chat"); })}>
          <Trash2 /> Delete conversation
        </Button>
      </div>
    </div>
  );
}

export function NewChatForms({
  reports,
  presets,
  defaultReport,
  premium,
}: {
  reports: { id: string; title: string }[];
  presets: { key: string; label: string }[];
  defaultReport?: string;
  premium: { available: boolean; credits: number; label: string | null };
}) {
  const [report, setReport] = useState(defaultReport ?? reports[0]?.id ?? "");
  const [preset, setPreset] = useState<string>(presets[0]?.key ?? "");
  const [custom, setCustom] = useState("");
  const [usePremium, setUsePremium] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const go = (input: unknown) =>
    start(async () => {
      setError(null);
      const r = await startChatAction(input);
      if (!r.ok) return setError(r.error);
      router.push(`/chat/${r.data!.id}`);
    });
  const premiumBox = (
    <label className="flex items-center gap-2 text-xs text-muted-foreground">
      <input type="checkbox" className="size-4" checked={usePremium} disabled={!premium.available} onChange={(e) => setUsePremium(e.target.checked)} />
      {premium.available ? `Use ${premium.label} (premium, 1 credit per conversation · you have ${premium.credits})` : "Premium model: coming soon (free model is used)"}
    </label>
  );
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <form
        className="space-y-3 rounded-lg border p-4"
        data-testid="new-report-chat"
        onSubmit={(e) => {
          e.preventDefault();
          go({ mode: "REPORT", assessmentId: report || null, premium: usePremium });
        }}
      >
        <h2 className="flex items-center gap-2 font-medium">
          <MessageSquareText className="size-4" aria-hidden /> Ask about your report
        </h2>
        <div className="grid gap-1 text-sm">
          <label htmlFor="chat-report">Report</label>
          <select id="chat-report" value={report} onChange={(e) => setReport(e.target.value)} className="h-10 rounded-md border border-input bg-background px-2 text-sm">
            <option value="">My latest report</option>
            {reports.map((r) => (
              <option key={r.id} value={r.id}>
                {r.title}
              </option>
            ))}
          </select>
        </div>
        {premiumBox}
        <Button type="submit" disabled={pending}>
          Start
        </Button>
      </form>
      <form
        className="space-y-3 rounded-lg border p-4"
        data-testid="new-roleplay"
        onSubmit={(e) => {
          e.preventDefault();
          go({ mode: "ROLEPLAY", preset: custom ? undefined : preset, scenario: custom || undefined, premium: usePremium });
        }}
      >
        <h2 className="flex items-center gap-2 font-medium">
          <Theater className="size-4" aria-hidden /> Practise a difficult conversation
        </h2>
        <div className="grid gap-1 text-sm">
          <label htmlFor="rp-preset">Situation</label>
          <select id="rp-preset" value={preset} onChange={(e) => setPreset(e.target.value)} className="h-10 rounded-md border border-input bg-background px-2 text-sm" disabled={!!custom}>
            {presets.map((p) => (
              <option key={p.key} value={p.key}>
                {p.label}
              </option>
            ))}
          </select>
        </div>
        <label className="grid gap-1 text-sm">
          Or describe your own (who the AI plays, and the situation)
          <Input value={custom} onChange={(e) => setCustom(e.target.value)} maxLength={300} placeholder="e.g. a client unhappy about a delayed launch" />
        </label>
        <Button type="submit" disabled={pending}>
          Start role-play
        </Button>
      </form>
      {error && (
        <div className="md:col-span-2">
          <Alert tone="error">{error}</Alert>
        </div>
      )}
    </div>
  );
}

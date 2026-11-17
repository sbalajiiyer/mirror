import { auth } from "@/auth";
import { ZodError } from "zod";
import { DomainError } from "@/lib/errors";
import { sendMessageStream } from "@/lib/services/chat";

export const runtime = "nodejs";

/** AI coach reply as newline-delimited JSON events: {t:"delta"} … {t:"done"} or {t:"error"}. */
export async function POST(req: Request, { params }: { params: Promise<{ chatId: string }> }) {
  const uid = (await auth())?.user?.id;
  if (!uid) return Response.json({ error: "unauthorized" }, { status: 401 });
  const { chatId } = await params;
  const { text } = (await req.json().catch(() => ({}))) as { text?: string };
  const enc = new TextEncoder();
  let cancelled = false;
  const body = new ReadableStream<Uint8Array>({
    cancel() {
      cancelled = true;
    },
    async start(controller) {
      // If the person navigates away mid-reply, keep going so the reply is still saved.
      let open = true;
      const send = (o: object) => {
        if (!open || cancelled) return;
        try {
          controller.enqueue(enc.encode(`${JSON.stringify(o)}\n`));
        } catch {
          open = false;
        }
      };
      try {
        for await (const ev of sendMessageStream(uid, chatId, String(text ?? ""))) send(ev);
      } catch (e) {
        const msg = e instanceof ZodError ? (e.issues[0]?.message ?? "Invalid message") : e instanceof DomainError ? e.message : "Something went wrong. Please try again.";
        if (!(e instanceof ZodError || e instanceof DomainError)) console.error("[chat] stream failed", e);
        send({ t: "error", error: msg });
      } finally {
        if (open) controller.close();
      }
    },
  });
  return new Response(body, { headers: { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store", "x-accel-buffering": "no" } });
}

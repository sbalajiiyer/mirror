/** Marks the end of a streamed chat reply; the facts the reply relied on follow, separated by " | ". */
export const CITE_MARK = "[[facts]]";

/** Holds back text that might be the start of the facts marker, so it never reaches the screen. */
export function citationFilter() {
  let full = "";
  let emitted = 0;
  return {
    push(text: string) {
      full += text;
      const at = full.indexOf(CITE_MARK);
      const safe = at >= 0 ? at : Math.max(emitted, full.length - CITE_MARK.length);
      const out = full.slice(emitted, safe);
      emitted = Math.max(emitted, safe);
      return out;
    },
    finish() {
      const at = full.indexOf(CITE_MARK);
      const reply = (at >= 0 ? full.slice(0, at) : full).trim();
      const rest = at >= 0 ? full.slice(emitted, at) : full.slice(emitted);
      const citations = at >= 0 ? full.slice(at + CITE_MARK.length).split("|").map((c) => c.trim().slice(0, 160)).filter(Boolean).slice(0, 3) : [];
      return { tail: rest.replace(/\s+$/, ""), reply: reply.slice(0, 2500), citations };
    },
  };
}

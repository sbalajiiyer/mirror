import type { ReportData } from "@/lib/report/compute";
import type { ThemeGroup } from "@/lib/text/themes";
import { Badge } from "@/components/ui/badge";

function SentimentBadge({ value }: { value: number }) {
  if (value > 0.2) return <Badge variant="success">Mostly positive</Badge>;
  if (value < -0.2) return <Badge variant="warning">Mostly constructive</Badge>;
  return <Badge variant="outline">Mixed</Badge>;
}

export function ThemeList({ themes, max = 3 }: { themes: ThemeGroup[]; max?: number }) {
  if (!themes.length) return <p className="text-sm text-muted-foreground">No comments.</p>;
  return (
    <div className="grid gap-3 md:grid-cols-2">
      {themes.map((t) => (
        <article key={t.key} className="rounded-lg border p-4 avoid-break">
          <header className="flex items-center justify-between gap-2">
            <h4 className="font-medium">{t.label}</h4>
            <span className="flex items-center gap-2 text-xs text-muted-foreground">
              {t.count} {t.count === 1 ? "mention" : "mentions"}
              <SentimentBadge value={t.sentiment} />
            </span>
          </header>
          <ul className="mt-3 space-y-2">
            {t.comments.slice(0, max).map((c, i) => (
              <li key={i} className="border-l-2 border-primary/30 pl-3 text-sm">
                &ldquo;{c.text}&rdquo;
                <span className="mt-0.5 block text-xs text-muted-foreground">— {c.group}</span>
              </li>
            ))}
          </ul>
          {t.comments.length > max && <p className="mt-2 text-xs text-muted-foreground">+{t.comments.length - max} more</p>}
        </article>
      ))}
    </div>
  );
}

export function WordCloud({ words }: { words: { word: string; count: number }[] }) {
  if (!words.length) return null;
  const max = Math.max(...words.map((w) => w.count));
  const min = Math.min(...words.map((w) => w.count));
  const size = (c: number) => (max === min ? 1 : (c - min) / (max - min));
  const alpha = [...words].sort((a, b) => a.word.localeCompare(b.word));
  return (
    <ul className="flex flex-wrap items-baseline gap-x-3 gap-y-1" aria-label="Most used words">
      {alpha.map((w) => (
        <li key={w.word} style={{ fontSize: `${0.8 + size(w.count) * 1.1}rem`, opacity: 0.55 + size(w.count) * 0.45 }} className="font-medium text-foreground" title={`${w.count} mentions`}>
          {w.word}
        </li>
      ))}
    </ul>
  );
}

export function SscBoard({ ssc }: { ssc: ReportData["comments"]["ssc"] }) {
  const cols = [
    { key: "START" as const, title: "Start", tone: "border-t-emerald-500" },
    { key: "STOP" as const, title: "Stop", tone: "border-t-red-500" },
    { key: "CONTINUE" as const, title: "Continue", tone: "border-t-sky-500" },
  ];
  return (
    <div className="grid gap-4 md:grid-cols-3">
      {cols.map((col) => (
        <section key={col.key} className={`rounded-lg border border-t-4 ${col.tone} bg-muted/30 p-3`} aria-label={col.title}>
          <h4 className="mb-2 font-semibold">{col.title}</h4>
          <div className="space-y-3">
            {ssc[col.key].map((t) => (
              <div key={t.key} className="avoid-break">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {t.label} · {t.count}
                </p>
                <ul className="mt-1 space-y-1.5">
                  {t.comments.map((c, i) => (
                    <li key={i} className="rounded-md bg-card p-2 text-sm shadow-sm">
                      {c.text}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
            {ssc[col.key].length === 0 && <p className="text-sm text-muted-foreground">No suggestions.</p>}
          </div>
        </section>
      ))}
    </div>
  );
}

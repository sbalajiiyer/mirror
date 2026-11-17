"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LOCALE_NAMES, RATER_LOCALES, type RaterLocale } from "@/lib/i18n/rater";
import { saveTranslationAction, translateAllAction } from "@/app/(app)/assessments/actions";

type Row = { id: string; text: string; competency: string; translations: Partial<Record<RaterLocale, { text: string; competency: string; machine?: boolean }>> };

/** Lets the subject review and correct how their custom statements read in each rater language. */
export function TranslationsPanel({ assessmentId, rows }: { assessmentId: string; rows: Row[] }) {
  const langs = RATER_LOCALES.filter((l) => l !== "en");
  const [lang, setLang] = useState<RaterLocale>(langs[0]);
  const [msg, setMsg] = useState<{ tone: "error" | "success"; text: string } | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const missing = rows.some((r) => langs.some((l) => !r.translations[l]));
  return (
    <div className="space-y-4" data-testid="translations-panel">
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1.5">
          <label htmlFor="tr-lang" className="text-sm font-medium">
            Language
          </label>
          <select id="tr-lang" value={lang} onChange={(e) => setLang(e.target.value as RaterLocale)} className="block h-10 rounded-md border border-input bg-background px-3 text-sm">
            {langs.map((l) => (
              <option key={l} value={l}>
                {LOCALE_NAMES[l]}
              </option>
            ))}
          </select>
        </div>
        {missing && (
          <Button
            variant="outline"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const r = await translateAllAction(assessmentId);
                setMsg(r.ok ? { tone: "success", text: "Translated. Check anything that reads oddly." } : { tone: "error", text: r.error });
                router.refresh();
              })
            }
          >
            {pending ? "Translating…" : "Translate missing with AI"}
          </Button>
        )}
      </div>
      <ul className="space-y-4">
        {rows.map((r) => (
          <TranslationRow key={`${r.id}-${lang}`} assessmentId={assessmentId} row={r} lang={lang} onSaved={() => setMsg({ tone: "success", text: "Saved." })} />
        ))}
      </ul>
      {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}
    </div>
  );
}

function TranslationRow({ assessmentId, row, lang, onSaved }: { assessmentId: string; row: Row; lang: RaterLocale; onSaved: () => void }) {
  const cur = row.translations[lang];
  const [text, setText] = useState(cur?.text ?? "");
  const [comp, setComp] = useState(cur?.competency ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <li className="space-y-2 rounded-lg border p-3 text-sm">
      <p className="text-muted-foreground">
        {row.competency} · {row.text}
      </p>
      <div className="grid gap-2 sm:grid-cols-[1fr_12rem_auto]">
        <Input aria-label={`${LOCALE_NAMES[lang]} statement`} value={text} onChange={(e) => setText(e.target.value)} placeholder="Not translated yet" />
        <Input aria-label={`${LOCALE_NAMES[lang]} competency name`} value={comp} onChange={(e) => setComp(e.target.value)} placeholder="Competency" />
        <Button
          variant="outline"
          disabled={pending || !text || !comp}
          onClick={() =>
            start(async () => {
              setError(null);
              const r = await saveTranslationAction(assessmentId, { questionId: row.id, locale: lang, text, competency: comp });
              if (!r.ok) return setError(r.error);
              onSaved();
            })
          }
        >
          Save
        </Button>
      </div>
      {cur?.machine && <p className="text-xs text-muted-foreground">Machine-translated</p>}
      {error && <Alert tone="error">{error}</Alert>}
    </li>
  );
}

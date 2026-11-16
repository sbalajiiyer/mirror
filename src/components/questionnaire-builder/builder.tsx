"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { toFirstPerson } from "@/lib/questionnaire";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { deleteQuestionnaireAction, saveQuestionnaireAction } from "@/app/(app)/questionnaires/actions";

type Q = { text: string; selfText: string; selfEdited?: boolean };
type Section = { name: string; description: string; questions: Q[] };
type State = { name: string; description: string; competencies: Section[] };

const blankQ = (): Q => ({ text: "{name} ", selfText: "I ", selfEdited: false });
const blankSection = (): Section => ({ name: "", description: "", questions: [blankQ(), blankQ(), blankQ()] });

export function QuestionnaireBuilder({ id, initial }: { id?: string; initial?: State }) {
  const [s, setS] = useState<State>(initial ?? { name: "", description: "", competencies: [blankSection()] });
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const total = s.competencies.reduce((n, c) => n + c.questions.length, 0);

  const setSection = (i: number, patch: Partial<Section>) => setS((st) => ({ ...st, competencies: st.competencies.map((c, j) => (j === i ? { ...c, ...patch } : c)) }));
  const setQ = (i: number, k: number, patch: Partial<Q>) =>
    setSection(i, { questions: s.competencies[i].questions.map((q, j) => (j === k ? { ...q, ...patch } : q)) });
  const move = (i: number, d: -1 | 1) =>
    setS((st) => {
      const cs = [...st.competencies];
      const j = i + d;
      if (j < 0 || j >= cs.length) return st;
      [cs[i], cs[j]] = [cs[j], cs[i]];
      return { ...st, competencies: cs };
    });

  const save = () =>
    start(async () => {
      setError(null);
      const payload = {
        name: s.name,
        description: s.description,
        competencies: s.competencies.map((c) => ({ name: c.name, description: c.description, questions: c.questions.map(({ text, selfText }) => ({ text, selfText })) })),
      };
      const r = await saveQuestionnaireAction(payload, id);
      if (!r.ok) return setError(r.error);
      router.push(`/questionnaires/${r.data!.id}?saved=1`);
      router.refresh();
    });

  return (
    <div className="space-y-5" data-testid="builder">
      <Card>
        <CardContent className="space-y-4 pt-6">
          <div className="space-y-1.5">
            <Label htmlFor="q-name">Questionnaire name</Label>
            <Input id="q-name" value={s.name} onChange={(e) => setS({ ...s, name: e.target.value })} placeholder="e.g. Product manager 360" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="q-desc">Description (optional)</Label>
            <Input id="q-desc" value={s.description} onChange={(e) => setS({ ...s, description: e.target.value })} />
          </div>
          <p className="text-xs text-muted-foreground">
            Write each statement as something raters can observe, starting with {"{name}"} (it becomes your first name). Raters score how often it happens, 1–5. The self-assessment wording is filled in for you — check it reads naturally.
          </p>
        </CardContent>
      </Card>

      {s.competencies.map((c, i) => (
        <Card key={i} data-testid="builder-section">
          <CardHeader className="pb-3">
            <div className="flex items-end gap-2">
              <div className="flex-1 space-y-1.5">
                <Label htmlFor={`sec-${i}`}>Section {i + 1}</Label>
                <Input id={`sec-${i}`} value={c.name} onChange={(e) => setSection(i, { name: e.target.value })} placeholder="e.g. Stakeholder management" />
              </div>
              <Button type="button" variant="ghost" size="icon" aria-label="Move section up" onClick={() => move(i, -1)} disabled={i === 0}>
                <ArrowUp />
              </Button>
              <Button type="button" variant="ghost" size="icon" aria-label="Move section down" onClick={() => move(i, 1)} disabled={i === s.competencies.length - 1}>
                <ArrowDown />
              </Button>
              <Button type="button" variant="ghost" size="icon" aria-label={`Remove section ${i + 1}`} onClick={() => setS({ ...s, competencies: s.competencies.filter((_, j) => j !== i) })} disabled={s.competencies.length === 1}>
                <Trash2 />
              </Button>
            </div>
            <Input aria-label={`Section ${i + 1} description`} value={c.description} onChange={(e) => setSection(i, { description: e.target.value })} placeholder="Short description (optional)" className="mt-2" />
          </CardHeader>
          <CardContent className="space-y-3">
            {c.questions.map((q, k) => (
              <div key={k} className="space-y-1.5 rounded-lg border p-3">
                <div className="flex items-center gap-2">
                  <Input
                    aria-label={`Section ${i + 1} statement ${k + 1}`}
                    value={q.text}
                    onChange={(e) => setQ(i, k, { text: e.target.value, ...(q.selfEdited ? {} : { selfText: toFirstPerson(e.target.value) }) })}
                  />
                  <Button type="button" variant="ghost" size="icon" aria-label="Remove statement" onClick={() => setSection(i, { questions: c.questions.filter((_, j) => j !== k) })} disabled={c.questions.length === 1}>
                    <Trash2 />
                  </Button>
                </div>
                <Input
                  aria-label={`Section ${i + 1} statement ${k + 1} self wording`}
                  value={q.selfText}
                  onChange={(e) => setQ(i, k, { selfText: e.target.value, selfEdited: true })}
                  className="h-8 text-xs text-muted-foreground"
                />
              </div>
            ))}
            {c.questions.length < 8 && (
              <Button type="button" variant="ghost" size="sm" onClick={() => setSection(i, { questions: [...c.questions, blankQ()] })}>
                <Plus /> Add statement
              </Button>
            )}
          </CardContent>
        </Card>
      ))}

      <div className="flex flex-wrap items-center justify-between gap-3">
        {s.competencies.length < 10 && (
          <Button type="button" variant="outline" onClick={() => setS({ ...s, competencies: [...s.competencies, blankSection()] })}>
            <Plus /> Add section
          </Button>
        )}
        <span className="text-sm text-muted-foreground">
          {s.competencies.length} sections · {total} statements · about {Math.max(3, Math.round(total * 0.2 + 2))} minutes for raters
        </span>
      </div>

      {error && <Alert tone="error">{error}</Alert>}
      <div className="flex flex-wrap gap-2">
        <Button onClick={save} disabled={pending} data-testid="save-questionnaire">
          {pending ? "Saving…" : "Save questionnaire"}
        </Button>
        {id && (
          <Button
            variant="ghost"
            className="text-destructive"
            onClick={() =>
              start(async () => {
                if (!confirm("Delete this questionnaire?")) return;
                const r = await deleteQuestionnaireAction(id);
                if (!r.ok) return setError(r.error);
                router.push("/questionnaires");
              })
            }
          >
            Delete
          </Button>
        )}
      </div>
    </div>
  );
}

export type { State as BuilderState };

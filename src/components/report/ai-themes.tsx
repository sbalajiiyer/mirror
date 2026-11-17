"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Sparkles } from "lucide-react";
import type { ThemeGroup } from "@/lib/text/themes";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { aiThemesAction } from "@/app/(app)/assessments/ai-actions";
import { ThemeList } from "./comments";

type AIThemes = { themes: (ThemeGroup & { summary: string })[]; generatedAt: string; generatedBy: string };

/** Keyword themes, with an optional AI grouping by meaning the owner can create and switch to. */
export function CommentThemes({ assessmentId, keyword, ai, canCreate, print = false }: { assessmentId?: string; keyword: ThemeGroup[]; ai: AIThemes | null; canCreate: boolean; print?: boolean }) {
  const [view, setView] = useState<"ai" | "keyword">(ai ? "ai" : "keyword");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const showAI = view === "ai" && ai;
  return (
    <div className="space-y-3" data-testid="comment-themes">
      {!print && (ai || canCreate) && (
        <div className="flex flex-wrap items-center gap-2">
          {ai && (
            <div role="group" aria-label="Theme grouping" className="inline-flex rounded-md border p-0.5 text-sm">
              {(["ai", "keyword"] as const).map((v) => (
                <button key={v} type="button" aria-pressed={view === v} onClick={() => setView(v)} className={`rounded px-3 py-1 ${view === v ? "bg-primary text-primary-foreground" : "hover:bg-accent"}`}>
                  {v === "ai" ? "By meaning (AI)" : "By keyword"}
                </button>
              ))}
            </div>
          )}
          {canCreate && assessmentId && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={pending}
              data-testid="ai-themes-button"
              onClick={() =>
                start(async () => {
                  setError(null);
                  const r = await aiThemesAction(assessmentId);
                  if (!r.ok) return setError(r.error);
                  setView("ai");
                  router.refresh();
                })
              }
            >
              <Sparkles /> {pending ? "Grouping…" : ai ? "Regroup with AI" : "Group comments with AI"}
            </Button>
          )}
        </div>
      )}
      {error && <Alert tone="error">{error}</Alert>}
      {showAI ? (
        <div className="space-y-3" data-testid="ai-themes">
          <ul className="space-y-1 text-sm">
            {ai.themes
              .filter((t) => t.summary)
              .map((t) => (
                <li key={t.key}>
                  <strong className="font-medium">{t.label}:</strong> {t.summary}
                </li>
              ))}
          </ul>
          <ThemeList themes={ai.themes} />
          <p className="text-xs text-muted-foreground">
            Grouped by AI on {ai.generatedAt.slice(0, 10)}{ai.generatedBy === "mock" ? " (sample)" : ""}. Only the comment text was sent; raters stay anonymous.
          </p>
        </div>
      ) : (
        <ThemeList themes={keyword} />
      )}
    </div>
  );
}

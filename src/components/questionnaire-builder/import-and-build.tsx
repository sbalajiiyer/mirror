"use client";

import { useRef, useState, useTransition } from "react";
import { Download, FileSpreadsheet, Upload } from "lucide-react";
import type { DraftQuestionnaire, ImportLayout } from "@/lib/import/questionnaire-import";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { importQuestionnaireAction } from "@/app/(app)/questionnaires/actions";
import { QuestionnaireBuilder } from "./builder";

const LAYOUT_LABEL: Record<ImportLayout, string> = {
  template: "Mirror template layout",
  form_export: "form responses export (Google Forms / Microsoft Forms)",
  two_columns: "two columns (section, statement)",
  list: "a list of statements",
};

/** Optional spreadsheet import above the free builder. The import fills the builder; nothing is saved until Save. */
export function ImportAndBuild() {
  const [draft, setDraft] = useState<DraftQuestionnaire | null>(null);
  const [info, setInfo] = useState<{ layout: ImportLayout; warnings: string[]; statements: number; file: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const [pending, start] = useTransition();
  const input = useRef<HTMLInputElement>(null);

  const upload = (file: File | undefined) => {
    if (!file) return;
    setError(null);
    start(async () => {
      const fd = new FormData();
      fd.set("file", file);
      const r = await importQuestionnaireAction(fd);
      if (input.current) input.current.value = "";
      if (!r.ok) return setError(r.error);
      setDraft(r.data!.draft);
      setInfo({ layout: r.data!.layout, warnings: r.data!.warnings, statements: r.data!.statements, file: file.name });
      setVersion((v) => v + 1);
    });
  };

  return (
    <div className="space-y-5">
      <Card data-testid="import-card">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <FileSpreadsheet className="size-4" aria-hidden /> Import from Excel or CSV (free)
          </CardTitle>
          <CardDescription>
            Upload a questionnaire you already have. You can use the Mirror template, a plain list of statements, or a Google Forms / Microsoft Forms
            responses export (only the questions are imported; answers are ignored). You&apos;ll review everything before saving.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <label className="inline-flex">
              <span className="sr-only">Questionnaire file (.xlsx or .csv)</span>
              <input
                ref={input}
                type="file"
                accept=".xlsx,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                className="block text-sm file:mr-3 file:rounded-md file:border file:border-input file:bg-background file:px-3 file:py-1.5 file:text-sm file:font-medium"
                onChange={(e) => upload(e.target.files?.[0])}
                disabled={pending}
                data-testid="import-file"
              />
            </label>
            {pending && (
              <span className="inline-flex items-center gap-1 text-sm text-muted-foreground" role="status">
                <Upload className="size-4 animate-pulse" aria-hidden /> Reading…
              </span>
            )}
            <Button asChild variant="link" size="sm" className="px-0">
              <a href="/templates/mirror-questionnaire-template.csv" download>
                <Download aria-hidden /> Download the template (CSV)
              </a>
            </Button>
          </div>
          <details className="text-xs text-muted-foreground">
            <summary className="cursor-pointer">How to export from Google Forms or Microsoft Forms</summary>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>Google Forms: open the form → Responses → the three-dot menu → Download responses (.csv). Or link it to Sheets and use File → Download → .xlsx.</li>
              <li>Microsoft Forms: open the form → Responses → Open results in Excel, then upload that .xlsx.</li>
              <li>Old .xls files: save as .xlsx or .csv first. Files up to 1 MB.</li>
            </ul>
          </details>
          {error && <Alert tone="error">{error}</Alert>}
          {info && (
            <div className="space-y-2" data-testid="import-result">
              <Alert tone="success">
                Imported {info.statements} statements in {draft?.competencies.length} sections from {info.file}, read as {LAYOUT_LABEL[info.layout]}. Check the wording
                below, then save.
              </Alert>
              {info.warnings.length > 0 && (
                <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground" data-testid="import-warnings">
                  {info.warnings.map((w) => (
                    <li key={w}>{w}</li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </CardContent>
      </Card>
      <QuestionnaireBuilder key={version} initial={draft ?? undefined} />
    </div>
  );
}

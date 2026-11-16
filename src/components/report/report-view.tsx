"use client";

import { useMemo, useState } from "react";
import { Download, Printer, ShieldCheck } from "lucide-react";
import type { ReportData } from "@/lib/report/compute";
import { goalLabel } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { SscBoard, ThemeList, WordCloud } from "./comments";
import { QuestionDistribution } from "./distribution";
import { GapChart } from "./gap-chart";
import { GroupHeatmap } from "./heatmap";
import { JohariWindow } from "./johari";
import { groupColor, fmt } from "./palette";
import { CompetencyRadar } from "./radar-chart";
import { SummaryCard } from "./summary-card";
import { AISummaryCard } from "@/components/ai/ai-summary-card";
import type { StoredAISummary } from "@/lib/services/ai";
import Link from "next/link";
import { ListChecks } from "lucide-react";

export function ReportView({
  report,
  generatedAt,
  pdfUrl,
  print = false,
  aiSummary = null,
}: {
  report: ReportData;
  generatedAt: string;
  pdfUrl?: string;
  print?: boolean;
  aiSummary?: StoredAISummary | null;
}) {
  const groups = report.anonymity.groups;
  const [visibleGroups, setVisibleGroups] = useState<string[]>([]);
  const [selected, setSelected] = useState<string>(report.competencies[0]?.key ?? "");
  const [pdfState, setPdfState] = useState<"idle" | "busy" | "error">("idle");
  const qById = useMemo(() => new Map(report.questions.map((q) => [q.id, q])), [report.questions]);
  const compName = (k: string) => report.competencies.find((c) => c.key === k)?.name ?? k;

  const select = (k: string) => {
    setSelected(k);
    if (!print) document.getElementById("drilldown")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  if (!report.anonymity.available) {
    return (
      <Alert tone="warning">
        Not enough responses to show results without risking anyone&apos;s anonymity. {report.anonymity.notes.join(" ")}
      </Alert>
    );
  }

  const downloadPdf = async () => {
    if (!pdfUrl) return;
    setPdfState("busy");
    try {
      const res = await fetch(pdfUrl);
      if (!res.ok) throw new Error(String(res.status));
      const blob = await res.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `${report.assessment.title.replace(/[^\w-]+/g, "-")}.pdf`;
      a.click();
      URL.revokeObjectURL(a.href);
      setPdfState("idle");
    } catch {
      setPdfState("error");
    }
  };

  const sections = print ? report.competencies.map((c) => c.key) : [selected];

  return (
    <div className="space-y-6" data-testid="report">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm text-muted-foreground">360° feedback report · {goalLabel(report.assessment.goal)}</p>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{report.assessment.title}</h1>
          <p className="mt-1 flex flex-wrap items-center gap-x-3 text-sm text-muted-foreground">
            <span>{report.anonymity.othersN} raters</span>
            <span>{groups.map((g) => `${g.label} (${g.n})`).join(" · ")}</span>
            <span>Generated {new Date(generatedAt).toLocaleDateString()}</span>
          </p>
        </div>
        {!print && (
          <div className="no-print flex flex-wrap gap-2">
            <Button asChild variant="secondary">
              <Link href={`/assessments/${report.assessment.id}/plan`}>
                <ListChecks /> Development plan
              </Link>
            </Button>
            {pdfUrl && (
              <Button onClick={downloadPdf} disabled={pdfState === "busy"} data-testid="pdf">
                <Download /> {pdfState === "busy" ? "Preparing PDF…" : "Download PDF"}
              </Button>
            )}
            <Button variant="outline" onClick={() => window.print()} aria-label="Print">
              <Printer />
            </Button>
          </div>
        )}
      </header>
      {pdfState === "error" && (
        <Alert tone="error" className="no-print">
          PDF export isn&apos;t available on this server (needs a headless browser). Use the print button and “Save as PDF” instead.
        </Alert>
      )}

      <Alert tone="info" className="flex items-start gap-2">
        <ShieldCheck className="mt-0.5 size-4 shrink-0" />
        <span>
          Results for a group are shown only when at least {report.anonymity.min} people in it responded
          {groups.some((g) => g.exempt) ? "; your manager agreed to be shown separately" : ""}. {report.anonymity.notes.join(" ")}
        </span>
      </Alert>

      <AISummaryCard assessmentId={report.assessment.id} summary={aiSummary} print={print} />

      <SummaryCard report={report} />

      <Card className="avoid-break">
        <CardHeader>
          <CardTitle>Competency profile</CardTitle>
          <CardDescription>Your self-rating against the average of everyone else{groups.length ? " — add rater groups to compare" : ""}.</CardDescription>
          {!print && groups.length > 0 && (
            <div className="flex flex-wrap gap-2 pt-2" role="group" aria-label="Filter by rater group">
              {groups.map((g, i) => {
                const on = visibleGroups.includes(g.id);
                return (
                  <button
                    key={g.id}
                    aria-pressed={on}
                    onClick={() => setVisibleGroups((v) => (on ? v.filter((x) => x !== g.id) : [...v, g.id]))}
                    className={cn("flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs", on ? "border-foreground bg-accent" : "text-muted-foreground")}
                  >
                    <span className="size-2 rounded-full" style={{ background: groupColor(i) }} />
                    {g.label}
                  </button>
                );
              })}
            </div>
          )}
        </CardHeader>
        <CardContent>
          <CompetencyRadar report={report} visibleGroups={print ? groups.map((g) => g.id) : visibleGroups} print={print} />
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="avoid-break">
          <CardHeader>
            <CardTitle>Self vs. others</CardTitle>
            <CardDescription>Where your view of yourself differs from how others see you. Click a bar for detail.</CardDescription>
          </CardHeader>
          <CardContent>
            <GapChart report={report} onSelect={select} />
          </CardContent>
        </Card>
        <Card className="avoid-break">
          <CardHeader>
            <CardTitle>Johari window</CardTitle>
            <CardDescription>What&apos;s known to you and to others.</CardDescription>
          </CardHeader>
          <CardContent>
            <JohariWindow report={report} onSelect={select} />
          </CardContent>
        </Card>
      </div>

      <Card className="avoid-break print-break">
        <CardHeader>
          <CardTitle>By rater group</CardTitle>
          <CardDescription>Average score (1–{report.assessment.scaleMax}) per competency for each group. Click a row to drill down.</CardDescription>
        </CardHeader>
        <CardContent>
          <GroupHeatmap report={report} selected={print ? null : selected} onSelect={select} />
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        {(
          [
            ["Highest-rated behaviours", report.highest],
            ["Lowest-rated behaviours", report.lowest],
          ] as const
        ).map(([title, ids]) => (
          <Card key={title} className="avoid-break">
            <CardHeader>
              <CardTitle>{title}</CardTitle>
            </CardHeader>
            <CardContent>
              <ol className="space-y-2">
                {ids.map((id, i) => {
                  const q = qById.get(id)!;
                  return (
                    <li key={id} className="flex gap-3 text-sm">
                      <span className="w-4 shrink-0 text-muted-foreground">{i + 1}</span>
                      <span className="flex-1">
                        {q.text}
                        <span className="block text-xs text-muted-foreground">{compName(q.competencyKey)}</span>
                      </span>
                      <span className="font-semibold tabular-nums">{fmt(q.others.mean)}</span>
                    </li>
                  );
                })}
              </ol>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card id="drilldown" className="scroll-mt-20 print-break">
        <CardHeader>
          <CardTitle>Question detail</CardTitle>
          <CardDescription>
            How each statement was rated: <span style={{ color: "var(--chart-others)" }}>●</span> one dot per rating, <span style={{ color: "var(--chart-others)" }}>|</span> others&apos; average,{" "}
            <span style={{ color: "var(--chart-self)" }}>◆</span> your rating.
          </CardDescription>
          {!print && (
            <div className="flex flex-wrap gap-1.5 pt-2" role="tablist" aria-label="Competency">
              {report.competencies.map((c) => (
                <button
                  key={c.key}
                  role="tab"
                  aria-selected={selected === c.key}
                  onClick={() => setSelected(c.key)}
                  className={cn("rounded-md px-2.5 py-1 text-xs", selected === c.key ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground")}
                >
                  {c.name}
                </button>
              ))}
            </div>
          )}
        </CardHeader>
        <CardContent className="space-y-6">
          {sections.map((key) => (
            <section key={key} className="avoid-break" aria-label={compName(key)}>
              {print && <h4 className="font-semibold">{compName(key)}</h4>}
              <div className="divide-y">
                {report.questions
                  .filter((q) => q.competencyKey === key)
                  .map((q) => (
                    <QuestionDistribution key={q.id} q={q} scaleMax={report.assessment.scaleMax} />
                  ))}
              </div>
              {(report.comments.competency[key] ?? []).length > 0 && (
                <div className="mt-3 rounded-lg bg-muted/50 p-3">
                  <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Comments on {compName(key).toLowerCase()}</p>
                  <ul className="space-y-1.5 text-sm">
                    {report.comments.competency[key].map((c, i) => (
                      <li key={i}>
                        &ldquo;{c.text}&rdquo; <span className="text-xs text-muted-foreground">— {c.group}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </section>
          ))}
        </CardContent>
      </Card>

      <Card className="print-break">
        <CardHeader>
          <CardTitle>What people said</CardTitle>
          <CardDescription>
            {report.comments.total} comments, grouped into themes by keyword and shown only with the rater group. Raters can choose to have AI remove identifying details before submitting.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <ThemeList themes={report.comments.themes} />
          {report.comments.wordCloud.length > 0 && (
            <div>
              <h4 className="mb-2 text-sm font-medium">Most used words</h4>
              <WordCloud words={report.comments.wordCloud} />
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="avoid-break">
        <CardHeader>
          <CardTitle>Start · Stop · Continue</CardTitle>
          <CardDescription>Suggestions from your raters, grouped by theme.</CardDescription>
        </CardHeader>
        <CardContent>
          <SscBoard ssc={report.comments.ssc} />
        </CardContent>
      </Card>

      <p className="pb-6 text-center text-xs text-muted-foreground">
        This report is development feedback for {report.assessment.subjectFirstName}, not a performance or hiring assessment. It belongs to {report.assessment.subjectFirstName} and is private unless they choose to share it.
      </p>
    </div>
  );
}

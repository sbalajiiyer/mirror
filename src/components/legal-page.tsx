import { LEGAL, LEGAL_DRAFT } from "@/lib/legal";
import { Alert } from "@/components/ui/alert";

export function LegalPage({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <article className="mx-auto max-w-3xl space-y-6 text-[15px] leading-relaxed [&_h2]:mt-8 [&_h2]:text-lg [&_h2]:font-semibold [&_li]:mt-1 [&_ul]:list-disc [&_ul]:pl-5">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
        <p className="text-sm text-muted-foreground">
          {LEGAL.product} · operated by {LEGAL.company} · effective {LEGAL.effectiveDate}
        </p>
      </header>
      {LEGAL_DRAFT && (
        <Alert tone="warning" data-testid="legal-draft">
          Draft pending legal review. Details in [brackets] will be completed before launch.
        </Alert>
      )}
      {children}
    </article>
  );
}

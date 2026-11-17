import { cookies, headers } from "next/headers";
import { getRaterContext } from "@/lib/services/raters";
import { clientIp, hit, peek } from "@/lib/rate-limit";
import { pickLocale, raterStrings } from "@/lib/i18n/rater";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LanguagePicker } from "./language-picker";
import { RaterForm } from "./rater-form";

// Never cache: the page reflects this rater's live draft.
export const dynamic = "force-dynamic";

function Message({ title, body }: { title: string; body: string }) {
  return (
    <Card className="mt-6">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className="text-muted-foreground">{body}</CardContent>
    </Card>
  );
}

export default async function RaterPage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ lang?: string }> }) {
  const { token } = await params;
  const locale = pickLocale((await searchParams).lang, (await cookies()).get("mirror_rater_lang")?.value, (await headers()).get("accept-language"));
  const t = raterStrings(locale);
  const ip = await clientIp();
  const picker = <LanguagePicker locale={locale} label={t.language} />;
  const wrap = (node: React.ReactNode) => (
    <div lang={locale} className="space-y-2">
      {picker}
      {node}
    </div>
  );
  const tooMany = wrap(<Message title={t.slowDownTitle} body={t.slowDownBody} />);
  // Too many unrecognised links from this network: stop looking links up at all for a while.
  if (!(await peek("raterInvalidIp", ip)).ok) return tooMany;
  if (!(await hit("raterViewIp", ip)).ok) return tooMany;
  const ctx = await getRaterContext(token, locale);
  if (ctx.state === "invalid") await hit("raterInvalidIp", ip);
  switch (ctx.state) {
    case "invalid":
      return wrap(<Message title={t.invalidTitle} body={t.invalidBody} />);
    case "done":
      return wrap(<Message title={t.thankYou} body={t.doneBody(ctx.subjectFirstName)} />);
    case "declined":
      return wrap(<Message title={t.noProblem} body={t.declinedBody(ctx.subjectFirstName)} />);
    case "closed":
      return wrap(<Message title={t.closedTitle} body={t.closedBody(ctx.subjectFirstName)} />);
    case "not_open":
      return wrap(<Message title={t.notOpenTitle} body={t.notOpenBody(ctx.subjectFirstName)} />);
    case "open":
      return wrap(
        <RaterForm
          token={token}
          locale={locale}
          subjectFirstName={ctx.subjectFirstName}
          competencies={ctx.competencies}
          scaleMax={ctx.scaleMax}
          draft={ctx.draft}
          message={ctx.message}
          dueAt={ctx.dueAt}
          managerShownSeparately={ctx.managerShownSeparately}
          machineTranslated={ctx.machineTranslated}
        />,
      );
  }
}

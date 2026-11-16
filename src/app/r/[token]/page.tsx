import { getRaterContext } from "@/lib/services/raters";
import { clientIp, hit, peek } from "@/lib/rate-limit";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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

export default async function RaterPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const ip = await clientIp();
  const tooMany = <Message title="Please slow down" body="We've had a lot of requests from your network. Please wait a few minutes and open your link again." />;
  // Too many unrecognised links from this network: stop looking links up at all for a while.
  if (!(await peek("raterInvalidIp", ip)).ok) return tooMany;
  if (!(await hit("raterViewIp", ip)).ok) return tooMany;
  const ctx = await getRaterContext(token);
  if (ctx.state === "invalid") await hit("raterInvalidIp", ip);
  switch (ctx.state) {
    case "invalid":
      return <Message title="Link not recognised" body="This feedback link isn't valid. Please check you copied the whole link from your invitation." />;
    case "done":
      return <Message title="Thank you!" body={`You've already submitted feedback for ${ctx.subjectFirstName}. Your answers are anonymous.`} />;
    case "declined":
      return <Message title="No problem" body={`You've declined this request from ${ctx.subjectFirstName}.`} />;
    case "closed":
      return <Message title="Feedback has closed" body={`${ctx.subjectFirstName} is no longer collecting feedback. Thank you anyway!`} />;
    case "not_open":
      return <Message title="Not open yet" body={`${ctx.subjectFirstName} hasn't opened this feedback request yet.`} />;
    case "open":
      return (
        <RaterForm
          token={token}
          subjectFirstName={ctx.subjectFirstName}
          competencies={ctx.competencies}
          scaleMax={ctx.scaleMax}
          draft={ctx.draft}
          message={ctx.message}
          dueAt={ctx.dueAt}
          managerShownSeparately={ctx.managerShownSeparately}
        />
      );
  }
}

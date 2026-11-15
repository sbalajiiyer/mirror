import { getRaterContext } from "@/lib/services/raters";
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
  const ctx = await getRaterContext(token);
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

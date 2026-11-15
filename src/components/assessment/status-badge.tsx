import type { AssessmentStatus } from "@prisma/client";
import { Badge } from "@/components/ui/badge";

const MAP: Record<AssessmentStatus, { label: string; variant: "secondary" | "warning" | "default" | "success" }> = {
  DRAFT: { label: "Self-assessment needed", variant: "warning" },
  READY: { label: "Ready to launch", variant: "secondary" },
  COLLECTING: { label: "Collecting feedback", variant: "default" },
  CLOSED: { label: "Report ready", variant: "success" },
};

export function StatusBadge({ status }: { status: AssessmentStatus }) {
  const m = MAP[status];
  return <Badge variant={m.variant}>{m.label}</Badge>;
}

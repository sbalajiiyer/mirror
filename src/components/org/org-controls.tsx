"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { ActionResult } from "@/lib/action-result";
import {
  createCampaignAction,
  createGroupAction,
  createOrgAction,
  deleteGroupAction,
  inviteMembersAction,
  leaveOrgAction,
  removeMemberAction,
  respondOrgInviteAction,
  respondOrgInviteTokenAction,
  setGroupMembersAction,
  setPerformanceAction,
  setRoleAction,
  updateConsentAction,
} from "@/app/(app)/orgs/actions";

function useRun() {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const run = <T,>(fn: () => Promise<ActionResult<T>>, after?: (data: T | undefined) => void) =>
    start(async () => {
      setError(null);
      const r = await fn();
      if (!r.ok) return setError(r.error);
      after?.(r.data);
      router.refresh();
    });
  return { pending, error, run, router };
}

const Err = ({ e }: { e: string | null }) => (e ? <Alert tone="error">{e}</Alert> : null);

export function CreateOrgForm() {
  const [name, setName] = useState("");
  const { pending, error, run, router } = useRun();
  return (
    <form
      className="space-y-2"
      onSubmit={(e) => {
        e.preventDefault();
        run(() => createOrgAction(name), (d) => d && router.push(`/orgs/${d.id}`));
      }}
    >
      <Label htmlFor="org-name">Organization name</Label>
      <div className="flex flex-wrap gap-2">
        <Input id="org-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} required className="max-w-xs" placeholder="e.g. Brightline Studio" />
        <Button type="submit" disabled={pending}>
          Create organization
        </Button>
      </div>
      <Err e={error} />
    </form>
  );
}

export function OrgInviteButtons({ memberId, token }: { memberId?: string; token?: string }) {
  const { pending, error, run, router } = useRun();
  const respond = (accept: boolean) =>
    run(() => (token ? respondOrgInviteTokenAction(token, accept) : respondOrgInviteAction(memberId!, accept)), (orgId) => accept && orgId && router.push(`/orgs/${orgId}`));
  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <Button onClick={() => respond(true)} disabled={pending} data-testid="join-org">
          Join
        </Button>
        <Button variant="outline" onClick={() => respond(false)} disabled={pending}>
          Decline
        </Button>
      </div>
      <Err e={error} />
    </div>
  );
}

export function ConsentPanel({ orgId, orgName, initial }: { orgId: string; orgName: string; initial: { shareReports: boolean; shareTalentGrid: boolean } }) {
  const [s, setS] = useState(initial);
  const [saved, setSaved] = useState(false);
  const { pending, error, run } = useRun();
  return (
    <form
      className="space-y-3"
      data-testid="org-consent"
      onSubmit={(e) => {
        e.preventDefault();
        setSaved(false);
        run(() => updateConsentAction(orgId, s), () => setSaved(true));
      }}
    >
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">What {orgName}&apos;s admins can see</legend>
        <p className="text-xs text-muted-foreground">
          Always: whether you&apos;ve taken part in its 360 rounds, and team or cohort averages built from at least 5 people. Only 360s started from {orgName}&apos;s rounds
          count; your personal 360s never do.
        </p>
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" className="mt-1 size-4" checked={s.shareReports} onChange={(e) => setS({ ...s, shareReports: e.target.checked })} />
          <span>
            <span className="font-medium">Share my reports from {orgName}&apos;s 360 rounds</span>
            <span className="block text-xs text-muted-foreground">Admins can open them (scores and themes, never raters&apos; comments word for word) and see you by name on team heatmaps.</span>
          </span>
        </label>
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" className="mt-1 size-4" checked={s.shareTalentGrid} onChange={(e) => setS({ ...s, shareTalentGrid: e.target.checked })} />
          <span>
            <span className="font-medium">Include me on the talent grid</span>
            <span className="block text-xs text-muted-foreground">
              Places you on a 3×3 grid by your 360 score and a performance rating an admin enters. Used for development conversations; off by default.
            </span>
          </span>
        </label>
      </fieldset>
      <Button type="submit" disabled={pending}>
        Save
      </Button>
      {saved && (
        <span className="ml-2 text-sm text-muted-foreground" role="status">
          Saved.
        </span>
      )}
      <Err e={error} />
    </form>
  );
}

export function LeaveOrgButton({ orgId, orgName }: { orgId: string; orgName: string }) {
  const { pending, error, run, router } = useRun();
  return (
    <>
      <Button variant="ghost" size="sm" disabled={pending} onClick={() => confirm(`Leave ${orgName}? Admins lose any access you shared.`) && run(() => leaveOrgAction(orgId), () => router.push("/orgs"))}>
        Leave organization
      </Button>
      <Err e={error} />
    </>
  );
}

export function InviteMembersForm({ orgId }: { orgId: string }) {
  const [text, setText] = useState("");
  const [result, setResult] = useState<string | null>(null);
  const { pending, error, run } = useRun();
  return (
    <form
      className="space-y-2"
      data-testid="invite-members"
      onSubmit={(e) => {
        e.preventDefault();
        setResult(null);
        run(
          () => inviteMembersAction(orgId, text),
          (d) => {
            setText("");
            setResult(`Invited ${d!.added.length}${d!.skipped ? ` (${d!.skipped} already in the organization)` : ""}.`);
          },
        );
      }}
    >
      <Label htmlFor="invite-text">Invite people (one per line: “Name &lt;email&gt;”, “email, name” or just an email)</Label>
      <Textarea id="invite-text" rows={4} value={text} onChange={(e) => setText(e.target.value)} placeholder={"Ana Silva <ana@example.com>\nben@example.com, Ben Okafor"} />
      <Button type="submit" disabled={pending || !text.trim()}>
        Send invitations
      </Button>
      {result && <Alert tone="success">{result}</Alert>}
      <Err e={error} />
    </form>
  );
}

export function MemberRowActions({ orgId, memberId, role, status, isSelf }: { orgId: string; memberId: string; role: "ADMIN" | "MEMBER"; status: string; isSelf: boolean }) {
  const { pending, error, run } = useRun();
  return (
    <div className="flex flex-wrap items-center gap-1">
      {status === "ACTIVE" && (
        <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => setRoleAction(orgId, memberId, role === "ADMIN" ? "MEMBER" : "ADMIN"))}>
          {role === "ADMIN" ? "Make member" : "Make admin"}
        </Button>
      )}
      {!isSelf && (
        <Button size="sm" variant="ghost" disabled={pending} onClick={() => confirm("Remove this person from the organization?") && run(() => removeMemberAction(orgId, memberId))}>
          Remove
        </Button>
      )}
      <Err e={error} />
    </div>
  );
}

export function PerformanceSelect({ orgId, memberId, value, name }: { orgId: string; memberId: string; value: number | null; name: string }) {
  const { pending, error, run } = useRun();
  return (
    <>
      <select
        aria-label={`Performance rating for ${name}`}
        className="h-10 rounded-md border border-input bg-background px-3 text-sm"
        value={value ?? ""}
        disabled={pending}
        onChange={(e) => run(() => setPerformanceAction(orgId, memberId, e.target.value ? Number(e.target.value) : null))}
      >
        <option value="">Not rated</option>
        <option value="1">Low</option>
        <option value="2">Medium</option>
        <option value="3">High</option>
      </select>
      <Err e={error} />
    </>
  );
}

export function CreateGroupForm({ orgId }: { orgId: string }) {
  const [name, setName] = useState("");
  const [kind, setKind] = useState<"TEAM" | "COHORT">("TEAM");
  const { pending, error, run } = useRun();
  return (
    <form
      className="flex flex-wrap items-end gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        run(() => createGroupAction(orgId, kind, name), () => setName(""));
      }}
    >
      <label className="grid gap-1 text-xs font-medium">
        Type
        <select value={kind} onChange={(e) => setKind(e.target.value as "TEAM" | "COHORT")} className="h-10 rounded-md border border-input bg-background px-3 text-sm">
          <option value="TEAM">Team</option>
          <option value="COHORT">Cohort</option>
        </select>
      </label>
      <label className="grid gap-1 text-xs font-medium">
        Name
        <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} required className="h-9 w-56" placeholder="e.g. Product team" />
      </label>
      <Button type="submit" disabled={pending}>
        Add
      </Button>
      <Err e={error} />
    </form>
  );
}

export function GroupMembersForm({ orgId, groupId, members, selected }: { orgId: string; groupId: string; members: { id: string; name: string }[]; selected: string[] }) {
  const [sel, setSel] = useState(new Set(selected));
  const [saved, setSaved] = useState(false);
  const { pending, error, run } = useRun();
  return (
    <form
      className="space-y-2"
      onSubmit={(e) => {
        e.preventDefault();
        setSaved(false);
        run(() => setGroupMembersAction(orgId, groupId, [...sel]), () => setSaved(true));
      }}
    >
      <fieldset className="grid gap-1 sm:grid-cols-2 lg:grid-cols-3">
        <legend className="sr-only">Members</legend>
        {members.map((m) => (
          <label key={m.id} className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="size-4"
              checked={sel.has(m.id)}
              onChange={(e) => {
                const n = new Set(sel);
                if (e.target.checked) n.add(m.id);
                else n.delete(m.id);
                setSel(n);
              }}
            />
            {m.name}
          </label>
        ))}
      </fieldset>
      <div className="flex items-center gap-2">
        <Button type="submit" disabled={pending}>
          Save members ({sel.size})
        </Button>
        <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={() => confirm("Delete this group? Its 360 rounds stay.") && run(() => deleteGroupAction(orgId, groupId))}>
          Delete
        </Button>
        {saved && (
          <span className="text-sm text-muted-foreground" role="status">
            Saved.
          </span>
        )}
      </div>
      <Err e={error} />
    </form>
  );
}

export function CreateCampaignForm({ orgId, groups, frameworks }: { orgId: string; groups: { id: string; name: string; kind: string }[]; frameworks: { id: string; name: string }[] }) {
  const [s, setS] = useState({ name: "", groupId: "", frameworkId: frameworks[0]?.id ?? "", teamMode: false, dueInDays: 21 });
  const [done, setDone] = useState(false);
  const { pending, error, run } = useRun();
  const isTeam = groups.find((g) => g.id === s.groupId)?.kind === "TEAM";
  return (
    <form
      className="space-y-3"
      data-testid="create-campaign"
      onSubmit={(e) => {
        e.preventDefault();
        setDone(false);
        run(() => createCampaignAction(orgId, { ...s, groupId: s.groupId || null, teamMode: isTeam && s.teamMode }), () => {
          setDone(true);
          setS({ ...s, name: "" });
        });
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="grid gap-1 text-sm font-medium">
          Name
          <Input value={s.name} onChange={(e) => setS({ ...s, name: e.target.value })} maxLength={80} required placeholder="e.g. Spring 2027 leadership 360" />
        </label>
        <label className="grid gap-1 text-sm font-medium">
          Who takes part
          <select value={s.groupId} onChange={(e) => setS({ ...s, groupId: e.target.value })} className="h-10 rounded-md border border-input bg-background px-3 text-sm">
            <option value="">Everyone in the organization</option>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.kind === "TEAM" ? "Team" : "Cohort"}: {g.name}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-sm font-medium">
          Questionnaire
          <select value={s.frameworkId} onChange={(e) => setS({ ...s, frameworkId: e.target.value })} className="h-10 rounded-md border border-input bg-background px-3 text-sm">
            {frameworks.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-sm font-medium">
          Days to complete
          <Input type="number" min={7} max={90} value={s.dueInDays} onChange={(e) => setS({ ...s, dueInDays: Number(e.target.value) })} />
        </label>
      </div>
      {isTeam && (
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" className="mt-1 size-4" checked={s.teamMode} onChange={(e) => setS({ ...s, teamMode: e.target.checked })} />
          <span>
            <span className="font-medium">Team 360</span>
            <span className="block text-xs text-muted-foreground">Teammates are suggested as raters for each other, so the team rates every member and you get a team dynamics view.</span>
          </span>
        </label>
      )}
      <Button type="submit" disabled={pending}>
        {pending ? "Starting…" : "Start 360 round"}
      </Button>
      {done && <Alert tone="success">Started. Everyone taking part has been emailed a link to set up their 360.</Alert>}
      <Err e={error} />
    </form>
  );
}

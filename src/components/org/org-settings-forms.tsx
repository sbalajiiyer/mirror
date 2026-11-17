"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { saveSsoConfigAction, setSsoDomainAction, updateOrgDataAction, updateOrgAiAction, verifySsoDomainAction } from "@/app/(app)/orgs/[orgId]/settings/actions";

type Msg = { tone: "error" | "success"; text: string } | null;

function useRun() {
  const [msg, setMsg] = useState<Msg>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, ok: string) =>
    start(async () => {
      setMsg(null);
      const r = await fn();
      setMsg(r.ok ? { tone: "success", text: ok } : { tone: "error", text: r.error ?? "Something went wrong." });
      if (r.ok) router.refresh();
    });
  return { msg, pending, run };
}

const selectCls = "h-10 w-full rounded-md border border-input bg-background px-3 text-sm";

export function OrgDataForm({ orgId, initial }: { orgId: string; initial: { region: string; retentionMonths: number | null; allowPersonalCopy: boolean } }) {
  const [region, setRegion] = useState(initial.region);
  const [copy, setCopy] = useState(initial.allowPersonalCopy);
  const [ret, setRet] = useState(initial.retentionMonths ? String(initial.retentionMonths) : "");
  const { msg, pending, run } = useRun();
  return (
    <form
      className="space-y-4"
      data-testid="org-data-form"
      onSubmit={(e) => {
        e.preventDefault();
        run(() => updateOrgDataAction(orgId, { region, retentionMonths: ret ? Number(ret) : null, allowPersonalCopy: copy }), "Saved.");
      }}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="od-region">Data region</Label>
          <select id="od-region" className={selectCls} value={region} onChange={(e) => setRegion(e.target.value)}>
            <option value="us">United States</option>
            <option value="eu">European Union</option>
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="od-retention">Keep raw rater answers</Label>
          <select id="od-retention" className={selectCls} value={ret} onChange={(e) => setRet(e.target.value)}>
            <option value="">Until the person deletes them</option>
            <option value="12">12 months after a 360 closes</option>
            <option value="24">24 months after a 360 closes</option>
            <option value="36">36 months after a 360 closes</option>
          </select>
        </div>
      </div>
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" className="mt-1 size-4" checked={copy} onChange={(e) => setCopy(e.target.checked)} data-testid="allow-personal-copy" />
        <span>
          People who leave may copy their own reports to their Personal space
          <span className="block text-muted-foreground">Scores, themes and AI summaries only, never raters&apos; written comments. Their other data here is deleted 7 days after they leave.</span>
        </span>
      </label>
      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : "Save data settings"}
      </Button>
      {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}
    </form>
  );
}

export function SsoDomainForm({ orgId, domain }: { orgId: string; domain: string | null }) {
  const [d, setD] = useState(domain ?? "");
  const { msg, pending, run } = useRun();
  return (
    <form
      className="flex flex-col gap-2 sm:flex-row sm:items-end"
      onSubmit={(e) => {
        e.preventDefault();
        run(() => setSsoDomainAction(orgId, d), "Domain saved. Add the TXT record below, then verify.");
      }}
    >
      <div className="flex-1 space-y-1.5">
        <Label htmlFor="sso-domain">Email domain</Label>
        <Input id="sso-domain" value={d} onChange={(e) => setD(e.target.value)} placeholder="acme.com" required />
      </div>
      <Button type="submit" variant="outline" disabled={pending}>
        {domain ? "Change domain" : "Add domain"}
      </Button>
      {msg && <Alert tone={msg.tone} className="sm:basis-full">{msg.text}</Alert>}
    </form>
  );
}

export function VerifyDomainButton({ orgId }: { orgId: string }) {
  const { msg, pending, run } = useRun();
  return (
    <div className="space-y-2">
      <Button type="button" disabled={pending} onClick={() => run(() => verifySsoDomainAction(orgId), "Domain verified.")}>
        {pending ? "Checking DNS…" : "Verify domain"}
      </Button>
      {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}
    </div>
  );
}

export function SsoConfigForm({ orgId, initial, verified }: { orgId: string; initial: { issuer: string; clientId: string; hasSecret: boolean; enabled: boolean; required: boolean }; verified: boolean }) {
  const [s, setS] = useState({ issuer: initial.issuer, clientId: initial.clientId, clientSecret: "", enabled: initial.enabled, required: initial.required });
  const { msg, pending, run } = useRun();
  return (
    <form
      className="space-y-4"
      data-testid="sso-config-form"
      onSubmit={(e) => {
        e.preventDefault();
        run(() => saveSsoConfigAction(orgId, { ...s, clientSecret: s.clientSecret || undefined }), "SSO settings saved.");
      }}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="sso-issuer">Issuer URL</Label>
          <Input id="sso-issuer" value={s.issuer} onChange={(e) => setS({ ...s, issuer: e.target.value })} placeholder="https://acme.okta.com" required />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="sso-client">Client ID</Label>
          <Input id="sso-client" value={s.clientId} onChange={(e) => setS({ ...s, clientId: e.target.value })} required autoComplete="off" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="sso-secret">Client secret</Label>
          <Input id="sso-secret" type="password" value={s.clientSecret} onChange={(e) => setS({ ...s, clientSecret: e.target.value })} placeholder={initial.hasSecret ? "Saved (leave blank to keep)" : ""} autoComplete="new-password" />
        </div>
      </div>
      <div className="space-y-2 text-sm">
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={s.enabled} disabled={!verified} onChange={(e) => setS({ ...s, enabled: e.target.checked, required: e.target.checked && s.required })} />
          Switch on SSO for this domain
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={s.required} disabled={!s.enabled} onChange={(e) => setS({ ...s, required: e.target.checked })} />
          Require SSO (email links and Google sign-in are refused for this domain)
        </label>
        {!verified && <p className="text-xs text-muted-foreground">Verify your domain first to switch SSO on.</p>}
      </div>
      <Button type="submit" disabled={pending}>
        {pending ? "Checking your identity provider…" : "Save SSO settings"}
      </Button>
      {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}
    </form>
  );
}

/** Phase 11e: owners choose which premium AI models people may use here. The free model is always on. */
export function OrgAiForm({ orgId, models, allowed }: { orgId: string; models: { id: string; label: string; description: string }[]; allowed: string[] }) {
  const [on, setOn] = useState(new Set(allowed));
  const { msg, pending, run } = useRun();
  if (models.length === 0) return <p className="text-sm text-muted-foreground">Only the free model is available on this installation.</p>;
  return (
    <form
      className="space-y-3"
      data-testid="org-ai-form"
      onSubmit={(e) => {
        e.preventDefault();
        run(() => updateOrgAiAction(orgId, { allowedAiModels: [...on] }), "Saved.");
      }}
    >
      {models.map((m) => (
        <label key={m.id} className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            className="mt-1 size-4"
            checked={on.has(m.id)}
            onChange={(e) => {
              const next = new Set(on);
              if (e.target.checked) next.add(m.id);
              else next.delete(m.id);
              setOn(next);
            }}
          />
          <span>
            {m.label}
            <span className="block text-muted-foreground">{m.description}</span>
          </span>
        </label>
      ))}
      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : "Save AI settings"}
      </Button>
      {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}
    </form>
  );
}

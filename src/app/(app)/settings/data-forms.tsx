"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createApiTokenAction, deleteMyAccountAction, revokeApiTokenAction, setBenchmarkOptOutAction } from "./data-actions";

export function BenchmarkToggle({ optOut }: { optOut: boolean }) {
  const [v, setV] = useState(!optOut);
  const [pending, start] = useTransition();
  const [saved, setSaved] = useState(false);
  return (
    <label className="flex items-start gap-2 text-sm" data-testid="benchmark-toggle">
      <input
        type="checkbox"
        className="mt-1 size-4"
        checked={v}
        disabled={pending}
        onChange={(e) => {
          const next = e.target.checked;
          setV(next);
          setSaved(false);
          start(async () => {
            await setBenchmarkOptOutAction(!next);
            setSaved(true);
          });
        }}
      />
      <span>
        <span className="font-medium">Contribute my scores to anonymous benchmarks</span>
        <span className="block text-xs text-muted-foreground">
          Your latest full 360 on the built-in questionnaire is counted once, anonymously, in norms of 30+ people (10+ for a career stage). Only percentiles are
          stored. You can still see benchmarks if you turn this off.
        </span>
        {saved && (
          <span className="text-xs text-muted-foreground" role="status">
            Saved.
          </span>
        )}
      </span>
    </label>
  );
}

export function ApiTokens({ tokens }: { tokens: { id: string; name: string; prefix: string; lastUsedAt: string | null; revokedAt: string | null; createdAt: string }[] }) {
  const [name, setName] = useState("");
  const [shown, setShown] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <div className="space-y-3" data-testid="api-tokens">
      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          setError(null);
          start(async () => {
            const r = await createApiTokenAction(name);
            if (!r.ok) return setError(r.error);
            setShown(r.data!.token);
            setName("");
            router.refresh();
          });
        }}
      >
        <label className="grid gap-1 text-xs font-medium">
          Token name
          <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={40} required className="h-9 w-56" placeholder="e.g. Spreadsheet" />
        </label>
        <Button type="submit" size="sm" className="h-9" disabled={pending}>
          Create token
        </Button>
      </form>
      {shown && (
        <Alert tone="success" data-testid="new-token">
          Copy this token now; it won&apos;t be shown again:
          <code className="mt-1 block break-all rounded bg-background px-2 py-1 text-xs">{shown}</code>
        </Alert>
      )}
      {error && <Alert tone="error">{error}</Alert>}
      {tokens.length > 0 && (
        <ul className="divide-y rounded-lg border text-sm">
          {tokens.map((t) => (
            <li key={t.id} className="flex items-center justify-between gap-2 px-3 py-2">
              <span>
                <span className="font-medium">{t.name}</span> <code className="text-xs text-muted-foreground">{t.prefix}…</code>
                <span className="block text-xs text-muted-foreground">
                  {t.revokedAt ? "Revoked" : t.lastUsedAt ? `Last used ${new Date(t.lastUsedAt).toLocaleDateString()}` : "Never used"}
                </span>
              </span>
              {!t.revokedAt && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() =>
                    start(async () => {
                      await revokeApiTokenAction(t.id);
                      router.refresh();
                    })
                  }
                >
                  Revoke
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
      <p className="text-xs text-muted-foreground">
        Read-only endpoints (header <code>Authorization: Bearer &lt;token&gt;</code>): <code>/api/v1/me</code>, <code>/api/v1/sessions</code>, <code>/api/v1/dashboards</code>,{" "}
        <code>/api/v1/dashboards/&lt;id&gt;</code>. 120 requests per minute.
      </p>
    </div>
  );
}

export function DeleteAccountForm({ email }: { email: string }) {
  const [v, setV] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <form
      className="space-y-2"
      data-testid="delete-account"
      onSubmit={(e) => {
        e.preventDefault();
        if (!confirm("Delete your account and all your 360s, reports, goals and chats? This can't be undone.")) return;
        start(async () => {
          setError(null);
          const r = await deleteMyAccountAction(v);
          if (r && !r.ok) setError(r.error);
        });
      }}
    >
      <label htmlFor="del-email" className="text-sm">
        Type <strong>{email}</strong> to confirm
      </label>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input id="del-email" value={v} onChange={(e) => setV(e.target.value)} autoComplete="off" />
        <Button type="submit" variant="destructive" disabled={pending || !v}>
          {pending ? "Deleting…" : "Delete my account"}
        </Button>
      </div>
      {error && <Alert tone="error">{error}</Alert>}
    </form>
  );
}

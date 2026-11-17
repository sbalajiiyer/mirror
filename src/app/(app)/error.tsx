"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

/** Friendly fallback for crashes inside the app; the error is reported to built-in monitoring. */
export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const router = useRouter();
  useEffect(() => {
    fetch("/api/client-error", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message: error.digest ? `Server error ${error.digest}` : error.message, stack: error.stack, path: location.pathname }),
      keepalive: true,
    }).catch(() => {});
  }, [error]);
  return (
    <div className="mx-auto max-w-md py-16 text-center" role="alert">
      <h1 className="text-2xl font-semibold">Something went wrong</h1>
      <p className="mt-2 text-muted-foreground">We&apos;ve recorded the problem. Please try again; your data is safe.</p>
      <div className="mt-6 flex justify-center gap-2">
        <Button onClick={() => reset()}>Try again</Button>
        <Button variant="outline" onClick={() => router.push("/dashboard")}>
          Go to my 360s
        </Button>
      </div>
      {error.digest && <p className="mt-4 font-mono text-xs text-muted-foreground">Reference: {error.digest}</p>}
    </div>
  );
}

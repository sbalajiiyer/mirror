import { Logo } from "@/components/logo";
import { SkipLink } from "@/components/skip-link";

export const metadata = { robots: { index: false, follow: false } };

/** Public unsubscribe page (link in every non-essential email). No sign-in. */
export default function UnsubscribeLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh">
      <SkipLink />
      <header className="no-print border-b">
        <div className="mx-auto flex h-12 max-w-4xl items-center px-4">
          <Logo className="text-sm" />
        </div>
      </header>
      <main id="main" tabIndex={-1} className="mx-auto max-w-4xl px-4 py-6 outline-none">
        {children}
      </main>
    </div>
  );
}

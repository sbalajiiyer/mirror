import { Logo } from "@/components/logo";
import { SkipLink } from "@/components/skip-link";
import { SiteFooter } from "@/components/site-footer";

export const metadata = { title: "Give feedback", robots: { index: false, follow: false } };

export default function RaterLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh">
      <SkipLink />
      <header className="border-b">
        <div className="mx-auto flex h-12 max-w-xl items-center px-4">
          <Logo className="text-sm" />
        </div>
      </header>
      <main id="main" tabIndex={-1} className="mx-auto outline-none max-w-xl px-4 py-6">{children}</main>
      <SiteFooter narrow />
    </div>
  );
}

import { AppHeader } from "@/components/app-header";
import { SkipLink } from "@/components/skip-link";
import { SiteFooter } from "@/components/site-footer";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SkipLink />
      <AppHeader />
      <main id="main" tabIndex={-1} className="mx-auto outline-none max-w-6xl px-4 py-6 sm:py-10">{children}</main>
      <SiteFooter />
    </>
  );
}

import { Logo } from "@/components/logo";

export const metadata = { title: "Give feedback", robots: { index: false, follow: false } };

export default function RaterLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh">
      <header className="border-b">
        <div className="mx-auto flex h-12 max-w-xl items-center px-4">
          <Logo className="text-sm" />
        </div>
      </header>
      <main className="mx-auto max-w-xl px-4 py-6">{children}</main>
    </div>
  );
}

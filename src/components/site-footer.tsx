import Link from "next/link";

export function SiteFooter({ narrow = false }: { narrow?: boolean }) {
  return (
    <footer className="no-print border-t">
      <div className={`mx-auto flex flex-wrap items-center justify-between gap-2 px-4 py-6 text-sm text-muted-foreground ${narrow ? "max-w-xl" : "max-w-6xl"}`}>
        <span>Mirror · development feedback, not a performance tool</span>
        <nav aria-label="Legal" className="flex gap-4">
          <Link href="/privacy" className="hover:text-foreground hover:underline">
            Privacy
          </Link>
          <Link href="/terms" className="hover:text-foreground hover:underline">
            Terms
          </Link>
          <Link href="/security" className="hover:text-foreground hover:underline">
            Security
          </Link>
          <Link href="/copyright" className="hover:text-foreground hover:underline">
            Copyright
          </Link>
        </nav>
      </div>
    </footer>
  );
}

export function Logo({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 font-semibold tracking-tight ${className}`}>
      <svg aria-hidden viewBox="0 0 32 32" className="size-6">
        <circle cx="16" cy="16" r="14" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-primary" />
        <path d="M16 4a12 12 0 0 1 0 24z" fill="currentColor" className="text-primary" />
        <circle cx="16" cy="16" r="4" fill="var(--chart-self)" />
      </svg>
      Mirror
    </span>
  );
}

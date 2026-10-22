import Link from "next/link";

export function Mark({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" aria-hidden="true" className="shrink-0">
      <rect x="1.5" y="5" width="11" height="10" rx="1.5" fill="#ffe14a" transform="skewX(-8)" />
      <path d="M16.5 2.5v15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export function Wordmark() {
  return (
    <Link href="/" className="flex items-center gap-2 text-ink" aria-label="Foreshadow home">
      <Mark />
      <span className="display text-[21px] leading-none tracking-tight">Foreshadow</span>
    </Link>
  );
}

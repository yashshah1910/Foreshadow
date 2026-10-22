import Link from "next/link";

export function Mark({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 22 22" aria-hidden="true" className="shrink-0">
      <rect x="2.5" y="6" width="12" height="11" rx="2.5" fill="#ffe14a" transform="skewX(-8)" />
      <rect x="16.5" y="2.5" width="3" height="17" rx="1.5" fill="currentColor" />
    </svg>
  );
}

export function Wordmark() {
  return (
    <Link href="/" className="flex items-center gap-2 text-ink" aria-label="Foreshadow home">
      <Mark />
      <span className="display text-[22px] leading-none">Foreshadow</span>
    </Link>
  );
}

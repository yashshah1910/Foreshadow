import Link from "next/link";

/** A highlighter swipe ahead of an event line: the footprint before the news. */
export function Mark({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" className="shrink-0">
      <path d="M2.5 7.5 L15.5 6 L14.5 18 L1.5 18.8 Z" fill="#ffe14a" />
      <path d="M3 15 L6 13.5 L8.5 14.5 L11 9 L13.2 11.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M18.5 3.5 V20.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export function Wordmark() {
  return (
    <Link href="/" className="pressable flex items-center gap-2 rounded-md -ml-1 px-1 py-1 text-ink" aria-label="Foreshadow home">
      <Mark />
      <span className="display text-[18px] leading-none">Foreshadow</span>
    </Link>
  );
}

"use client";

import { useWatchlist } from "@/lib/hooks/useWatchlist";

/** "Watch TSLA": saves the stock on this device so Coming up can show it first. */
export function WatchButton({ ticker }: { ticker: string }) {
  const { has, toggle } = useWatchlist();
  const on = has(ticker);
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={() => toggle(ticker)}
      className={`pressable btn h-10 px-4 text-[14.5px] ${on ? "bg-ink text-surface hover:bg-ink" : "btn-soft"}`}
      title={on ? `Stop watching ${ticker}` : `Watch ${ticker} on this device`}
    >
      <svg width="15" height="15" viewBox="0 0 24 24" aria-hidden="true" fill={on ? "#ffe14a" : "none"} stroke={on ? "#ffe14a" : "currentColor"} strokeWidth="2" strokeLinejoin="round">
        <path d="m12 3.5 2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9Z" />
      </svg>
      {on ? `Watching ${ticker}` : `Watch ${ticker}`}
    </button>
  );
}

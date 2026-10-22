"use client";

import { useState } from "react";

export function ShareButton({ id }: { id: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        const url = `${window.location.origin}/event/${encodeURIComponent(id)}`;
        try {
          await navigator.clipboard.writeText(url);
          setCopied(true);
          setTimeout(() => setCopied(false), 1600);
        } catch {
          window.prompt("Copy this link", url);
        }
      }}
      className="pressable inline-flex h-9 items-center gap-2 rounded-md border border-line-strong bg-surface px-3 text-[13px] text-ink hover:bg-surface-2"
    >
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
        {copied ? <path d="M4 12.5 9 17.5 20 6.5" /> : <path d="M10 14a4.5 4.5 0 0 0 6.4 0l3-3a4.5 4.5 0 0 0-6.4-6.4l-1 1M14 10a4.5 4.5 0 0 0-6.4 0l-3 3a4.5 4.5 0 0 0 6.4 6.4l1-1" />}
      </svg>
      {copied ? "Link copied" : "Copy case link"}
    </button>
  );
}

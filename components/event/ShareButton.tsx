"use client";

import { useState } from "react";

export function ShareButton({ id, text }: { id: string; text: string }) {
  const [copied, setCopied] = useState(false);
  const path = `/event/${encodeURIComponent(id)}`;
  return (
    <div className="flex flex-wrap gap-2">
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
      className="pressable btn btn-soft w-fit"
    >
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
        {copied ? <path d="M4 12.5 9 17.5 20 6.5" /> : <path d="M10 14a4.5 4.5 0 0 0 6.4 0l3-3a4.5 4.5 0 0 0-6.4-6.4l-1 1M14 10a4.5 4.5 0 0 0-6.4 0l-3 3a4.5 4.5 0 0 0 6.4 6.4l1-1" />}
      </svg>
      {copied ? "Link copied" : "Copy link"}
    </button>
    <a
      href={`https://x.com/intent/post?text=${encodeURIComponent(text)}&url=${encodeURIComponent(`https://foreshadow-six.vercel.app${path}`)}`}
      target="_blank"
      rel="noreferrer"
      className="pressable btn btn-soft w-fit"
    >
      <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M17.8 3h3.1l-6.8 7.8 8 10.2h-6.3l-4.9-6.4L5.3 21H2.2l7.3-8.3L1.8 3h6.4l4.4 5.9L17.8 3Zm-1.1 16.2h1.7L7.4 4.7H5.5l11.2 14.5Z" />
      </svg>
      Post on X
    </a>
    </div>
  );
}

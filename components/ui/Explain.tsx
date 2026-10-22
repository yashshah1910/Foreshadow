"use client";

import { useEffect, useId, useRef, useState } from "react";
import { GLOSSARY, type GlossaryKey } from "@/lib/glossary";

/**
 * A small "?" beside a label that opens a one-line plain explanation.
 * Opens on click or keyboard, closes on Escape, outside click or blur.
 */
export function Explain({ term, label, compact = false }: { term: GlossaryKey; label?: string; compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const wrap = useRef<HTMLSpanElement | null>(null);
  const entry = GLOSSARY[term];

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <span ref={wrap} className="relative inline-flex align-middle">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        aria-label={`What is ${label ?? entry.title}?`}
        onClick={() => setOpen((o) => !o)}
        className={`grid place-items-center rounded-full bg-surface-2 font-semibold leading-none text-ink-2 transition-colors hover:bg-surface-3 hover:text-ink ${compact ? "ml-1 h-4 w-4 text-[10px]" : "ml-1.5 h-[18px] w-[18px] text-[11px]"}`}
      >
        ?
      </button>
      {open ? (
        <span
          id={id}
          role="tooltip"
          className="pop absolute left-1/2 top-full z-30 mt-2 w-64 -translate-x-1/2 whitespace-normal p-3.5 text-left text-[13.5px] font-normal leading-relaxed text-ink-2"
        >
          <span className="block font-semibold text-ink">{entry.title}</span>
          <span className="mt-1 block">{entry.body}</span>
        </span>
      ) : null}
    </span>
  );
}

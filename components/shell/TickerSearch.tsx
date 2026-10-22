"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState, useTransition } from "react";

interface Hit {
  ticker: string;
  name: string;
}

export function TickerSearch() {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [, startTransition] = useTransition();
  const listId = useId();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const abort = useRef<AbortController | null>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        inputRef.current?.focus();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    const term = q.trim();
    if (!term) return;
    abort.current?.abort();
    const ac = new AbortController();
    abort.current = ac;
    const t = setTimeout(() => {
      fetch(`/api/tickers/search?q=${encodeURIComponent(term)}`, { signal: ac.signal })
        .then((r) => (r.ok ? r.json() : { hits: [] }))
        .then((j: { hits: Hit[] }) => {
          setHits(j.hits ?? []);
          setActive(0);
        })
        .catch(() => {});
    }, 100);
    return () => clearTimeout(t);
  }, [q]);

  function go(ticker: string) {
    const t = ticker.trim().toUpperCase();
    if (!t) return;
    setOpen(false);
    setQ("");
    setHits([]);
    inputRef.current?.blur();
    startTransition(() => router.push(`/ticker/${t}`));
  }

  return (
    <div className="relative">
      <label className="sr-only" htmlFor="ticker-search">
        Open a ticker dossier
      </label>
      <div className="flex h-8 items-center gap-2 rounded-md border hairline bg-surface pl-2.5 pr-1.5 focus-within:border-line-strong">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" className="text-ink-3" aria-hidden="true">
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5" strokeLinecap="round" />
        </svg>
        <input
          ref={inputRef}
          id="ticker-search"
          role="combobox"
          aria-expanded={open && hits.length > 0}
          aria-controls={listId}
          aria-autocomplete="list"
          autoComplete="off"
          spellCheck={false}
          value={q}
          placeholder="Ticker"
          onChange={(e) => {
            setQ(e.target.value);
            if (!e.target.value.trim()) setHits([]);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 120)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActive((a) => Math.min(a + 1, Math.max(hits.length - 1, 0)));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((a) => Math.max(a - 1, 0));
            } else if (e.key === "Enter") {
              e.preventDefault();
              go(hits[active]?.ticker ?? q);
            } else if (e.key === "Escape") {
              setOpen(false);
              inputRef.current?.blur();
            }
          }}
          className="w-16 bg-transparent font-mono text-[13px] uppercase text-ink outline-none placeholder:font-sans placeholder:normal-case placeholder:text-ink-3 sm:w-24"
        />
        <kbd className="hidden rounded border hairline px-1 font-mono text-[10px] text-ink-3 sm:inline">⌘K</kbd>
      </div>
      {open && hits.length > 0 ? (
        <ul id={listId} role="listbox" className="sheet absolute right-0 mt-1.5 w-64 overflow-hidden py-1">
          {hits.map((h, i) => (
            <li
              key={h.ticker}
              role="option"
              aria-selected={i === active}
              onMouseDown={(e) => {
                e.preventDefault();
                go(h.ticker);
              }}
              onMouseEnter={() => setActive(i)}
              className={`flex cursor-pointer items-baseline gap-2.5 px-3 py-2 text-[13px] ${i === active ? "bg-surface-2 text-ink" : "text-ink-2"}`}
            >
              <span className="w-12 font-mono font-medium text-ink">{h.ticker}</span>
              <span className="truncate">{h.name}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

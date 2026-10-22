"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState, useTransition } from "react";
import { track } from "@/lib/analytics";

interface Hit {
  ticker: string;
  name: string;
}

/** Shown when the box is empty, so a first-time visitor has somewhere to start. */
const POPULAR: Hit[] = [
  { ticker: "TSLA", name: "Tesla" },
  { ticker: "NVDA", name: "Nvidia" },
  { ticker: "AAPL", name: "Apple" },
  { ticker: "META", name: "Meta Platforms" },
  { ticker: "AMZN", name: "Amazon" },
];

export function TickerSearch() {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [searched, setSearched] = useState("");
  const [, startTransition] = useTransition();
  const listId = useId();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const abort = useRef<AbortController | null>(null);
  const empty = !q.trim();
  const shown = empty ? POPULAR : hits;

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const typing = e.target instanceof HTMLElement && (e.target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName));
      if (((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") || (e.key === "/" && !typing && !e.metaKey && !e.ctrlKey)) {
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
          setSearched(term);
        })
        .catch(() => {});
    }, 100);
    return () => clearTimeout(t);
  }, [q]);

  function go(ticker: string) {
    const t = ticker.trim().toUpperCase();
    if (!t) return;
    track("stock_searched", { ticker: t });
    setOpen(false);
    setQ("");
    setHits([]);
    inputRef.current?.blur();
    startTransition(() => router.push(`/ticker/${t}`));
  }

  return (
    <div className="relative">
      <label className="sr-only" htmlFor="ticker-search">
        Find a stock by ticker or company name
      </label>
      <div className="flex h-10 items-center gap-2 rounded-full bg-surface-2 pl-3.5 pr-2 transition-colors focus-within:bg-surface focus-within:ring-2 focus-within:ring-pen">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" className="shrink-0 text-ink-3" aria-hidden="true">
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5" strokeLinecap="round" />
        </svg>
        <input
          ref={inputRef}
          id="ticker-search"
          role="combobox"
          aria-expanded={open && shown.length > 0}
          aria-controls={listId}
          aria-autocomplete="list"
          autoComplete="off"
          spellCheck={false}
          value={q}
          placeholder="Find a stock"
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
              setActive((a) => Math.min(a + 1, Math.max(shown.length - 1, 0)));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((a) => Math.max(a - 1, 0));
            } else if (e.key === "Enter") {
              e.preventDefault();
              go(shown[active]?.ticker ?? q);
            } else if (e.key === "Escape") {
              setOpen(false);
              inputRef.current?.blur();
            }
          }}
          className="w-24 bg-transparent text-[15px] text-ink outline-none placeholder:text-ink-3 focus-visible:outline-none sm:w-40"
        />
        <kbd className="hidden rounded-md bg-surface px-1.5 py-0.5 text-[11px] font-medium text-ink-3 sm:inline">⌘K</kbd>
      </div>
      {open && hits.length === 0 && q.trim() && searched === q.trim() ? (
        <div className="pop absolute right-0 z-20 mt-2 w-72 p-4 text-[14px] text-ink-2" role="status">
          No stock matches &ldquo;{q.trim()}&rdquo;. Foreshadow covers FDA news and earnings for companies worth over $2B.
        </div>
      ) : null}
      {open && shown.length > 0 ? (
        <ul id={listId} role="listbox" aria-label={empty ? "Popular stocks" : "Matching stocks"} className="pop absolute right-0 z-20 mt-2 w-72 overflow-hidden p-1.5">
          {empty ? (
            <li role="presentation" className="px-3 pb-1 pt-1.5 text-[12.5px] font-medium text-ink-3">
              Try one of these
            </li>
          ) : null}
          {shown.map((h, i) => (
            <li
              key={h.ticker}
              role="option"
              aria-selected={i === active}
              onMouseDown={(e) => {
                e.preventDefault();
                go(h.ticker);
              }}
              onMouseEnter={() => setActive(i)}
              className={`flex cursor-pointer items-baseline gap-3 rounded-lg px-3 py-2 text-[14px] ${i === active ? "bg-surface-2 text-ink" : "text-ink-2"}`}
            >
              <span className="ticker w-14 shrink-0 text-ink">{h.ticker}</span>
              <span className="truncate">{h.name}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

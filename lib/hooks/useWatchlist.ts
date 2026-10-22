"use client";

import { useCallback, useSyncExternalStore } from "react";

/** Stocks a visitor watches, kept in this browser only (no account needed). */
const KEY = "fs-watch";
const EVENT = "fs-watch-change";
const EMPTY: string[] = [];
let cache: { raw: string | null; list: string[] } = { raw: null, list: EMPTY };

function read(): string[] {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (raw === cache.raw) return cache.list;
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    const list = Array.isArray(parsed) ? parsed.filter((t): t is string => typeof t === "string").slice(0, 50) : [];
    cache = { raw, list };
    return list;
  } catch {
    return EMPTY;
  }
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener(EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

export function useWatchlist() {
  const list = useSyncExternalStore(subscribe, read, () => EMPTY);
  const toggle = useCallback((ticker: string) => {
    const t = ticker.toUpperCase();
    const next = read().includes(t) ? read().filter((x) => x !== t) : [...read(), t];
    try {
      window.localStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      // storage blocked (private mode); the button simply won't stick
    }
    window.dispatchEvent(new Event(EVENT));
  }, []);
  return { list, has: (t: string) => list.includes(t.toUpperCase()), toggle };
}

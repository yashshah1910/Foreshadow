"use client";

import { useEffect, useState } from "react";

export function DossierSummary({ ticker, fallback }: { ticker: string; fallback: string }) {
  const [text, setText] = useState<string | null>(null);
  const [model, setModel] = useState<string | null>(null);
  useEffect(() => {
    const ac = new AbortController();
    fetch(`/api/dossier?ticker=${encodeURIComponent(ticker)}`, { signal: ac.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { summary: string; model: string } | null) => {
        if (j?.summary) {
          setText(j.summary);
          setModel(j.model);
        } else setText(fallback);
      })
      .catch(() => {
        if (!ac.signal.aborted) setText(fallback);
      });
    return () => ac.abort();
  }, [ticker, fallback]);
  return (
    <div>
      {text === null ? (
        <div className="space-y-3" aria-busy="true">
          <div className="h-4 w-10/12 rounded bg-surface-3" />
          <div className="h-4 w-8/12 rounded bg-surface-3" />
        </div>
      ) : (
        <p className="fade-in text-[16px] leading-[1.65] text-ink-2">{text}</p>
      )}
      <p className="mt-3 font-mono text-[11px] text-ink-3">{model && model !== "template" ? `summary by ${model}` : text ? "summary written from the scores" : ""}</p>
    </div>
  );
}

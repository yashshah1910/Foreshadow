"use client";

import { useEffect, useState } from "react";
import type { Narration as NarrationT } from "@/lib/data";

type State =
  | { status: "loading" }
  | { status: "ready"; narration: NarrationT; source: "claude" | "cached" | "fallback" }
  | { status: "offline"; reason: string };

export function Narration({ catalystId, score, initial }: { catalystId: string; score: number; initial: NarrationT | null }) {
  const [state, setState] = useState<State>(initial ? { status: "ready", narration: initial, source: "cached" } : { status: "loading" });
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (initial) return;
    const ac = new AbortController();
    fetch(`/api/narrate?id=${encodeURIComponent(catalystId)}`, { signal: ac.signal })
      .then(async (r) => {
        if (!r.ok) throw new Error(`narrator ${r.status}`);
        return (await r.json()) as { narration: NarrationT; source: "claude" | "cached" | "fallback" };
      })
      .then((j) => setState({ status: "ready", narration: j.narration, source: j.source }))
      .catch((e: unknown) => {
        if (ac.signal.aborted) return;
        setState({ status: "offline", reason: e instanceof Error ? e.message : "unavailable" });
      });
    return () => ac.abort();
  }, [catalystId, score, initial]);

  return (
    <section aria-labelledby="story-h" className="border-t hairline pt-6">
      <header className="flex items-baseline justify-between gap-3">
        <h2 id="story-h" className="display text-[22px] text-ink">Summary for sharing</h2>
        {state.status === "ready" && state.source !== "fallback" ? (
          <span className="text-[12.5px] text-ink-3">written by Claude</span>
        ) : null}
      </header>
      <div className="pt-4">
        {state.status === "loading" ? (
          <div className="space-y-3" aria-busy="true">
            <div className="h-4 w-11/12 rounded bg-surface-3" />
            <div className="h-4 w-10/12 rounded bg-surface-3" />
            <div className="h-4 w-7/12 rounded bg-surface-3" />
          </div>
        ) : state.status === "offline" ? (
          <p className="text-[14px] text-ink-2">The summary isn&apos;t available right now. Everything above still tells the full story.</p>
        ) : (
          <div className="fade-in">
            <p className="text-[15.5px] leading-[1.65] text-ink-2">{state.narration.story}</p>
            <div className="mt-5 rounded border hairline bg-surface-2 p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="label">Short version</p>
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(state.narration.caption);
                      setCopied(true);
                      setTimeout(() => setCopied(false), 1500);
                    } catch {
                      // clipboard blocked; the caption is selectable
                    }
                  }}
                  className="pressable rounded-[5px] border hairline bg-surface px-2.5 py-1 text-[12px] text-ink-2 hover:text-ink"
                >
                  {copied ? "Copied" : "Copy"}
                </button>
              </div>
              <p className="mt-2 text-[14px] leading-relaxed text-ink">{state.narration.caption}</p>
            </div>
            <p className="mt-3 text-[12px] text-ink-3">
              {state.source === "fallback"
                ? "Written automatically from the numbers on this page."
                : state.narration.numbersVerified
                  ? "Every number here was checked against the data on this page."
                  : "Some numbers here couldn't be checked against the data; trust the tables instead."}
            </p>
          </div>
        )}
      </div>
    </section>
  );
}

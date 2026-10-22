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
    <section aria-labelledby="story-h" className="sheet">
      <header className="flex items-baseline justify-between border-b hairline px-5 py-4">
        <h2 id="story-h" className="display text-[20px]">The story</h2>
        {state.status === "ready" ? (
          <span className="font-mono text-[11px] text-ink-3">
            {state.source === "fallback" ? "written from the breakdown" : `written by ${state.narration.model}`}
          </span>
        ) : null}
      </header>
      <div className="px-5 py-5">
        {state.status === "loading" ? (
          <div className="space-y-3" aria-busy="true">
            <div className="h-4 w-11/12 rounded bg-surface-3" />
            <div className="h-4 w-10/12 rounded bg-surface-3" />
            <div className="h-4 w-7/12 rounded bg-surface-3" />
          </div>
        ) : state.status === "offline" ? (
          <p className="text-[14px] text-ink-2">The narrator is offline ({state.reason}). The trace and the receipt below tell the full story.</p>
        ) : (
          <div className="fade-in">
            <p className="text-[16.5px] leading-[1.65] text-ink">{state.narration.story}</p>
            <div className="mt-5 rounded-md border hairline bg-surface-2 p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="label">Caption</p>
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
                  {copied ? "Copied" : "Copy caption"}
                </button>
              </div>
              <p className="mt-2 text-[14px] leading-relaxed text-ink">{state.narration.caption}</p>
            </div>
            <p className="mt-3 text-[12px] text-ink-3">
              {state.source === "fallback"
                ? "Template text from the breakdown. Add ANTHROPIC_API_KEY for the narrated version."
                : state.narration.numbersVerified
                  ? "Every number in this story appears in the rows on this page."
                  : "Some numbers could not be matched to the rows. Trust the receipt below."}
            </p>
          </div>
        )}
      </div>
    </section>
  );
}

"use client";

import { useEffect, useState } from "react";
import { Answer } from "./Answer";

interface ToolCall {
  name: string;
  source: "foreshadow" | "uw-mcp";
  ok: boolean;
}

interface AskResponse {
  answer: string;
  toolCalls: ToolCall[];
  offTopic?: boolean;
}

const SUGGESTIONS = ["Why did it score this way?", "What was the biggest bet?", "Has this happened before for this stock?"];
const MAX_LENGTH = 300;

/** What the answer is doing while the reader waits, in the order it usually happens. */
const STEPS = ["Reading this case's score", "Checking the trades", "Writing a short answer"];

const SOURCE_NAMES: Record<string, string> = {
  foreshadow_score: "this case's score",
  foreshadow_history: "the stock's track record",
  foreshadow_radar: "upcoming news",
};

export function AskPanel({ ticker, eventDate, summary }: { ticker: string; eventDate?: string; summary: string }) {
  const [q, setQ] = useState("");
  const [asked, setAsked] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState(0);
  const [res, setRes] = useState<AskResponse | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!busy) return;
    const t = setInterval(() => setStep((s) => Math.min(s + 1, STEPS.length - 1)), 3500);
    return () => clearInterval(t);
  }, [busy]);

  async function ask(question: string) {
    const text = question.trim();
    if (text.length < 2 || busy) return;
    setStep(0);
    setBusy(true);
    setErr(null);
    setRes(null);
    setAsked(text);
    try {
      const r = await fetch("/api/ask", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ question: text, context: { ticker, eventDate, summary } }),
      });
      const j = (await r.json().catch(() => ({ error: "Something went wrong. Try again in a moment." }))) as AskResponse | { error: string };
      if (!r.ok || "error" in j) throw new Error("error" in j ? j.error : "Something went wrong. Try again in a moment.");
      setRes(j);
      setQ("");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Something went wrong. Try again in a moment.");
    } finally {
      setBusy(false);
    }
  }

  const sources = [...new Set((res?.toolCalls ?? []).filter((t) => t.ok).map((t) => SOURCE_NAMES[t.name] ?? (t.source === "uw-mcp" ? "Unusual Whales data" : t.name)))];

  return (
    <section aria-labelledby="ask-h" className="tray p-6">
      <h2 id="ask-h" className="display text-[24px] text-ink">Ask about this case</h2>
      <p className="mt-1.5 text-[15px] leading-relaxed text-ink-3">
        Short answers from this case&apos;s data and Unusual Whales, written by Claude.
      </p>

      <form
        className="mt-4"
        onSubmit={(e) => {
          e.preventDefault();
          void ask(q);
        }}
      >
        <label htmlFor="ask-input" className="sr-only">Your question about {ticker}</label>
        <div className="card p-1.5 focus-within:ring-2 focus-within:ring-pen">
          <textarea
            id="ask-input"
            value={q}
            maxLength={MAX_LENGTH}
            onChange={(e) => setQ(e.target.value)}
            rows={2}
            placeholder={`Ask something about ${ticker}…`}
            className="block w-full resize-none bg-transparent px-2.5 py-2 text-[15px] text-ink outline-none placeholder:text-ink-3 focus-visible:outline-none"
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void ask(q);
              }
            }}
          />
          <div className="flex items-center justify-between gap-3 px-2 pb-1">
            <span className={`text-[12.5px] tnum ${q.length > MAX_LENGTH - 30 ? "text-ink-2" : "text-ink-3"}`}>
              {q.length > 0 ? `${q.length}/${MAX_LENGTH}` : ""}
            </span>
            <button type="submit" disabled={busy || q.trim().length < 2} className="pressable btn btn-primary h-9 px-4 text-[14px] disabled:opacity-35">
              Get answer
            </button>
          </div>
        </div>
        {!res && !busy ? (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                type="button"
                disabled={busy}
                onClick={() => void ask(s)}
                className="pressable rounded-full bg-surface px-3 py-1.5 text-[13.5px] text-ink-2 hover:text-ink"
              >
                {s}
              </button>
            ))}
          </div>
        ) : null}
      </form>

      {asked && (busy || res || err) ? (
        <div className="card mt-4 p-4" aria-live="polite">
          <p className="text-[13px] font-medium text-ink-3">You asked</p>
          <p className="mt-0.5 text-[15px] font-medium text-ink">{asked}</p>
          <div className="mt-3">
            {busy ? (
              <ol className="space-y-1.5 text-[14.5px]" aria-label="Working on your answer">
                {STEPS.map((label, i) => (
                  <li key={label} className={`flex items-center gap-2.5 ${i < step ? "text-ink-3" : i === step ? "text-ink" : "text-ink-3/60"}`}>
                    <span
                      aria-hidden="true"
                      className={`h-2 w-2 rounded-full ${i < step ? "bg-call" : i === step ? "bg-ink motion-safe:animate-pulse" : "bg-surface-3"}`}
                    />
                    {label}
                    {i < step ? <span className="sr-only">, done</span> : null}
                  </li>
                ))}
              </ol>
            ) : err ? (
              <p className="text-[15px] text-put-ink" role="alert">{err}</p>
            ) : res?.offTopic ? (
              <p className="text-[15px] text-ink-2">{res.answer}</p>
            ) : res ? (
              <>
                <Answer text={res.answer} />
                {sources.length > 0 ? (
                  <p className="mt-3 text-[13px] text-ink-3">Checked: {sources.join(", ")}.</p>
                ) : null}
              </>
            ) : null}
          </div>
        </div>
      ) : null}
    </section>
  );
}

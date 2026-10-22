"use client";

import { useState } from "react";

interface ToolCall {
  name: string;
  input: unknown;
  output: string;
  source: "foreshadow" | "uw-mcp";
  ok: boolean;
}

interface AskResponse {
  answer: string;
  toolCalls: ToolCall[];
  model: string;
  stopped: string;
}

const SUGGESTIONS = ["What drove this score?", "Did anyone know before this?", "Is this a repeat offender?"];

export function AskPanel({ ticker, eventDate, summary }: { ticker: string; eventDate?: string; summary: string }) {
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<AskResponse | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function ask(question: string) {
    if (!question.trim() || busy) return;
    setBusy(true);
    setErr(null);
    setRes(null);
    try {
      const r = await fetch("/api/ask", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ question, context: { ticker, eventDate, summary } }),
      });
      const j = (await r.json()) as AskResponse | { error: string };
      if (!r.ok || "error" in j) throw new Error("error" in j ? j.error : `HTTP ${r.status}`);
      setRes(j);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-labelledby="ask-h" className="border-t hairline pt-6">
      <header>
        <h2 id="ask-h" className="display text-[22px] text-ink">Ask a question</h2>
        <p className="mt-1 text-[14px] text-ink-3">Claude answers using Foreshadow&apos;s data and Unusual Whales, and shows what it looked up.</p>
      </header>
      <form
        className="pt-4"
        onSubmit={(e) => {
          e.preventDefault();
          void ask(q);
        }}
      >
        <label htmlFor="ask-input" className="sr-only">Question</label>
        <textarea
          id="ask-input"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          rows={2}
          placeholder={`Ask about ${ticker}…`}
          className="w-full resize-none rounded-md border border-line-strong bg-surface px-3 py-2.5 text-[13.5px] text-ink placeholder:text-ink-3 focus:border-ink focus:outline-none"
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void ask(q);
            }
          }}
        />
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => {
                setQ(s);
                void ask(s);
              }}
              className="pressable rounded-full border hairline bg-surface-2 px-3 py-1 text-[12px] text-ink-2 hover:text-ink"
            >
              {s}
            </button>
          ))}
        </div>
        <div className="mt-3 flex justify-end">
          <button type="submit" disabled={busy || !q.trim()} className="pressable h-9 rounded-md bg-ink px-4 text-[13px] font-medium text-surface disabled:opacity-35">
            {busy ? "Investigating…" : "Ask"}
          </button>
        </div>
      </form>
      {busy ? (
        <p className="pt-4 text-[13.5px] text-ink-3" aria-live="polite">
          Looking things up…
        </p>
      ) : null}
      {err ? (
        <p className="pt-4 text-[13.5px] text-ink-2" role="alert">
          {err}
        </p>
      ) : null}
      {res ? (
        <div className="fade-in pt-5">
          <p className="whitespace-pre-wrap text-[14px] leading-relaxed text-ink">{res.answer}</p>
          {res.toolCalls.length > 0 ? (
            <details className="mt-3 text-[12px]">
              <summary className="cursor-pointer text-ink-3 hover:text-ink-2">
                What Claude looked up ({res.toolCalls.length})
              </summary>
              <ol className="mt-2 space-y-2">
                {res.toolCalls.map((t, i) => (
                  <li key={i} className="rounded-md border hairline bg-surface-2 p-2.5">
                    <p className="font-mono text-ink">
                      <span className="text-ink-3">{t.source === "uw-mcp" ? "uw · " : "foreshadow · "}</span>
                      {t.name}
                      {!t.ok ? <span className="ml-2 text-put">error</span> : null}
                    </p>
                    <pre className="mt-1 max-h-32 overflow-auto whitespace-pre-wrap break-all text-[11px] text-ink-2">{JSON.stringify(t.input)}</pre>
                    <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap break-all text-[11px] text-ink-3">{t.output.slice(0, 1200)}</pre>
                  </li>
                ))}
              </ol>
            </details>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

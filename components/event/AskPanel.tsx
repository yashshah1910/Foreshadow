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

const CASE_SUGGESTIONS = ["Why did it score this way?", "What was the biggest bet?", "Has this happened before for this stock?"];
const STOCK_SUGGESTIONS = ["Does unusual betting show up before its news?", "Which case had the most unusual betting?", "Is any news coming up?"];
const MAX_LENGTH = 300;

/** What the answer is doing while the reader waits, in the order it usually happens. */
const STEPS = ["Reading this case's score", "Checking the trades", "Writing a short answer"];

const SOURCE_NAMES: Record<string, string> = {
  foreshadow_score: "this case's score",
  foreshadow_history: "the stock's track record",
  foreshadow_radar: "upcoming news",
  foreshadow_scorecard: "the scorecard",
  foreshadow_similar: "similar past cases",
};

export function AskPanel({
  ticker,
  eventDate,
  summary,
  scope = "case",
}: {
  ticker: string;
  eventDate?: string;
  summary: string;
  /** "stock" on a stock page: the questions are about the whole track record. */
  scope?: "case" | "stock";
}) {
  const SUGGESTIONS = scope === "stock" ? STOCK_SUGGESTIONS : CASE_SUGGESTIONS;
  const [q, setQ] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (!busy) return;
    const t = setInterval(() => setStep((s) => Math.min(s + 1, STEPS.length - 1)), 3500);
    return () => clearInterval(t);
  }, [busy]);

  async function ask(question: string) {
    const text = question.trim();
    if (text.length < 2 || busy) return;
    // Earlier answered turns become history, so follow-ups like "was it placed before the others?" make sense.
    const history = turns
      .filter((t) => t.res && !t.res.offTopic)
      .slice(-MAX_TURNS)
      .flatMap((t) => [
        { role: "user" as const, content: t.q },
        { role: "assistant" as const, content: t.res!.answer.slice(0, 1200) },
      ]);
    setStep(0);
    setBusy(true);
    setTurns((ts) => [...ts, { q: text }]);
    setQ("");
    let turn: Turn;
    try {
      const r = await fetch("/api/ask", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ question: text, context: { ticker, eventDate, summary }, history }),
      });
      const j = (await r.json().catch(() => ({ error: "Something went wrong. Try again in a moment." }))) as AskResponse | { error: string };
      if (!r.ok || "error" in j) throw new Error("error" in j ? j.error : "Something went wrong. Try again in a moment.");
      turn = { q: text, res: j };
    } catch (e) {
      turn = { q: text, err: e instanceof Error ? e.message : "Something went wrong. Try again in a moment." };
    }
    setTurns((ts) => [...ts.slice(0, -1), turn]);
    setBusy(false);
  }

  const started = turns.length > 0;

  return (
    <section aria-labelledby="ask-h" className="tray p-6">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="ask-h" className="display text-[24px] text-ink">{scope === "stock" ? `Ask about ${ticker}` : "Ask about this case"}</h2>
        {started && !busy ? (
          <button type="button" onClick={() => setTurns([])} className="shrink-0 text-[13.5px] font-medium text-ink-3 hover:text-ink">
            Start over
          </button>
        ) : null}
      </div>
      <p className="mt-1.5 text-[15px] leading-relaxed text-ink-3">
        Short answers from {scope === "stock" ? `${ticker}'s cases` : "this case's data"} and Unusual Whales, written by Claude.
      </p>

      {started ? (
        <ol className="mt-4 grid gap-2" aria-live="polite">
          {turns.map((t, i) => (
            <li key={i} className="card p-4">
              <p className="text-[13px] font-medium text-ink-3">{i === 0 ? "You asked" : "Then you asked"}</p>
              <p className="mt-0.5 text-[15px] font-medium text-ink">{t.q}</p>
              <div className="mt-3">
                {!t.res && !t.err ? (
                  <Progress step={step} />
                ) : t.err ? (
                  <p className="text-[15px] text-put-ink" role="alert">{t.err}</p>
                ) : t.res?.offTopic ? (
                  <p className="text-[15px] text-ink-2">{t.res.answer}</p>
                ) : t.res ? (
                  <>
                    <Answer text={t.res.answer} />
                    <Sources calls={t.res.toolCalls} />
                  </>
                ) : null}
              </div>
            </li>
          ))}
        </ol>
      ) : null}

      <form
        className="mt-4"
        onSubmit={(e) => {
          e.preventDefault();
          void ask(q);
        }}
      >
        <label htmlFor="ask-input" className="sr-only">{started ? "Ask a follow-up" : `Your question about ${ticker}`}</label>
        <div className="card p-1.5 focus-within:ring-2 focus-within:ring-pen">
          <textarea
            id="ask-input"
            value={q}
            maxLength={MAX_LENGTH}
            onChange={(e) => setQ(e.target.value)}
            rows={2}
            placeholder={started ? "Ask a follow-up…" : `Ask something about ${ticker}…`}
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
              {started ? "Ask" : "Get answer"}
            </button>
          </div>
        </div>
        {!started ? (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {SUGGESTIONS.map((sug) => (
              <button
                key={sug}
                type="button"
                disabled={busy}
                onClick={() => void ask(sug)}
                className="pressable rounded-full bg-surface px-3 py-1.5 text-[13.5px] text-ink-2 hover:text-ink"
              >
                {sug}
              </button>
            ))}
          </div>
        ) : null}
      </form>
    </section>
  );
}

interface Turn {
  q: string;
  res?: AskResponse;
  err?: string;
}

/** Earlier turns sent back as history; the API caps it too. */
const MAX_TURNS = 3;

function Progress({ step }: { step: number }) {
  return (
    <ol className="space-y-1.5 text-[14.5px]" aria-label="Working on your answer">
      {STEPS.map((label, i) => (
        <li key={label} className={`flex items-center gap-2.5 ${i < step ? "text-ink-3" : i === step ? "text-ink" : "text-ink-3/60"}`}>
          <span aria-hidden="true" className={`h-2 w-2 rounded-full ${i < step ? "bg-call" : i === step ? "bg-ink motion-safe:animate-pulse" : "bg-surface-3"}`} />
          {label}
          {i < step ? <span className="sr-only">, done</span> : null}
        </li>
      ))}
    </ol>
  );
}

function Sources({ calls }: { calls: ToolCall[] }) {
  const names = [...new Set(calls.filter((t) => t.ok).map((t) => SOURCE_NAMES[t.name] ?? (t.source === "uw-mcp" ? "Unusual Whales data" : t.name)))];
  return names.length > 0 ? <p className="mt-3 text-[13px] text-ink-3">Checked: {names.join(", ")}.</p> : null;
}

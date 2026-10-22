"use client";

import { useState } from "react";
import { track } from "@/lib/analytics";
import { OUTCOME_SHORT, outcomeOf } from "@/lib/plain";

type ToolName = "foreshadow_score" | "foreshadow_radar" | "foreshadow_history" | "foreshadow_scorecard" | "foreshadow_similar";

interface Field {
  key: string;
  label: string;
  placeholder: string;
}

interface Tool {
  name: ToolName;
  does: string;
  path: string;
  fields: Field[];
  summarise: (j: Record<string, unknown>) => string;
}

const TICKER: Field = { key: "ticker", label: "Ticker", placeholder: "TSLA" };
const DATE: Field = { key: "eventDate", label: "News date", placeholder: "2026-10-21" };

const TOOLS: Tool[] = [
  {
    name: "foreshadow_score",
    does: "Scores the betting before one piece of news: the score, which way it leaned and what the stock did.",
    path: "/api/score",
    fields: [TICKER, DATE],
    summarise: (j) =>
      `${j.ticker} scored ${num(j.score)} out of 100, leaning ${j.direction}. Result: ${OUTCOME_SHORT[outcomeOf(j as unknown as Parameters<typeof outcomeOf>[0])].toLowerCase()}.`,
  },
  {
    name: "foreshadow_radar",
    does: "Lists news coming up in the next days, ranked by how unusual the betting is so far.",
    path: "/api/radar",
    fields: [{ key: "daysAhead", label: "Days ahead", placeholder: "10" }],
    summarise: (j) => {
      const items = (j.items as { ticker: string; score: number }[] | undefined) ?? [];
      return items.length
        ? `${items.length} upcoming. Most unusual so far: ${items.slice(0, 3).map((i) => `${i.ticker} (${num(i.score)})`).join(", ")}.`
        : "Nothing scored in that window yet.";
    },
  },
  {
    name: "foreshadow_history",
    does: "Every case Foreshadow has scored for one stock, and how often its bets were right.",
    path: "/api/history",
    fields: [TICKER],
    summarise: (j) => {
      const n = (j.events as unknown[] | undefined)?.length ?? 0;
      return `${n} case${n === 1 ? "" : "s"} for ${j.ticker}.`;
    },
  },
  {
    name: "foreshadow_scorecard",
    does: "How often unusual betting was right, by kind of news, against ordinary betting.",
    path: "/api/scorecard",
    fields: [],
    summarise: (j) => {
      const first = (j.kinds as { finding?: string }[] | undefined)?.[0]?.finding;
      return `${num(j.cases)} finished cases.${first ? ` ${first}` : ""}`;
    },
  },
  {
    name: "foreshadow_similar",
    does: "Finished cases like this one (same kind of news, similar score) and how they turned out.",
    path: "/api/similar",
    fields: [TICKER, DATE],
    summarise: (j) =>
      `${num(j.similarCases)} similar cases${typeof j.rightPct === "number" ? `; their bets were right ${j.rightPct.toFixed(0)}% of the time` : ""}.`,
  },
];

function num(v: unknown): string {
  return typeof v === "number" ? (Number.isInteger(v) ? v.toLocaleString("en-US") : v.toFixed(0)) : String(v ?? "?");
}

async function timedJson(url: string): Promise<{ ok: boolean; status: number; ms: number; json: Record<string, unknown> | null }> {
  const t0 = performance.now();
  try {
    const r = await fetch(url);
    const json = (await r.json().catch(() => ({ error: "Not JSON" }))) as Record<string, unknown>;
    return { ok: r.ok, status: r.status, ms: Math.round(performance.now() - t0), json };
  } catch {
    return { ok: false, status: 0, ms: Math.round(performance.now() - t0), json: null };
  }
}

/** Run any of the five MCP tools from the page, through its REST twin. */
export function ToolPlayground({ ticker, eventDate }: { ticker: string; eventDate: string }) {
  const [active, setActive] = useState<ToolName>("foreshadow_score");
  const [values, setValues] = useState<Record<string, string>>({ ticker, eventDate, daysAhead: "10" });
  const [result, setResult] = useState<{ tool: ToolName; ok: boolean; ms: number; json: unknown; summary: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const tool = TOOLS.find((t) => t.name === active)!;
  const args = Object.fromEntries(
    tool.fields.map((f) => [f.key, f.key === "daysAhead" ? Number(values[f.key] || 10) : (values[f.key] ?? "").trim().toUpperCase()]),
  );
  if ("eventDate" in args) args.eventDate = (values.eventDate ?? "").trim();

  async function run() {
    setBusy(true);
    track("tool_tried", { tool: tool.name });
    const qs = new URLSearchParams(Object.entries(args).map(([k, v]) => [k, String(v)]));
    const r = await timedJson(`${tool.path}${qs.size ? `?${qs}` : ""}`);
    const ok = r.ok && r.json !== null && !("error" in r.json);
    setResult({
      tool: tool.name,
      ok,
      ms: r.ms,
      json: r.json,
      summary: ok ? tool.summarise(r.json!) : r.json ? String(r.json.error ?? `HTTP ${r.status}`) : "Couldn't reach the server.",
    });
    setBusy(false);
  }

  const shown = result?.tool === active ? result : null;

  return (
    <div className="tray mt-4 p-2">
      <div className="flex flex-wrap gap-1 p-2" role="tablist" aria-label="Tools">
        {TOOLS.map((t) => (
          <button
            key={t.name}
            type="button"
            role="tab"
            aria-selected={t.name === active}
            onClick={() => setActive(t.name)}
            className={`pressable rounded-full px-3 py-1.5 font-mono text-[12.5px] ${t.name === active ? "bg-ink text-surface" : "bg-surface text-ink-2 hover:text-ink"}`}
          >
            {t.name.replace("foreshadow_", "")}
          </button>
        ))}
      </div>
      <div className="card p-4" role="tabpanel">
        <p className="text-[15px] text-ink-2">{tool.does}</p>
        <form
          className="mt-3 flex flex-wrap items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void run();
          }}
        >
          {tool.fields.map((f) => (
            <label key={f.key} className="grid gap-1 text-[13px] font-medium text-ink-3">
              {f.label}
              <input
                value={values[f.key] ?? ""}
                placeholder={f.placeholder}
                onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
                className="h-9 w-[9.5rem] rounded-lg bg-surface-2 px-2.5 font-mono text-[13.5px] text-ink outline-none focus-visible:ring-2 focus-visible:ring-pen"
              />
            </label>
          ))}
          <button type="submit" disabled={busy} className="pressable btn btn-primary h-9 px-4 text-[14px] disabled:opacity-50">
            {busy ? "Running…" : "Run tool"}
          </button>
        </form>
        <p className="mt-3 text-[13px] text-ink-3">What Claude sends:</p>
        <pre tabIndex={0} className="mt-1 overflow-x-auto well px-3 py-2 font-mono text-[12.5px] text-ink">
          {JSON.stringify({ name: tool.name, arguments: args })}
        </pre>
        {shown ? (
          <div className="mt-3" aria-live="polite">
            <p className={`text-[14.5px] font-medium ${shown.ok ? "text-ink" : "text-put-ink"}`}>
              {shown.summary} <span className="font-normal text-ink-3 tnum">({shown.ms} ms)</span>
            </p>
            {shown.json ? (
              <>
                <p className="mt-3 text-[13px] text-ink-3">What Claude gets back:</p>
                <pre tabIndex={0} className="mt-1 max-h-[320px] overflow-auto well px-3 py-2 font-mono text-[12px] leading-relaxed text-ink">
                  {JSON.stringify(shown.json, null, 2)}
                </pre>
              </>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

"use client";

import { useEffect, useMemo, useState } from "react";
import type { DailyMetrics, OhlcBar, SignalBreakdown } from "@foreshadow/core";
import { useMeasure } from "@/lib/hooks/useMeasure";
import { bandPath } from "@/components/viz/Highlight";
import { money } from "@/lib/plain";
import { fmtDateShort, fmtInt, fmtMoney } from "@/lib/format";
import { track } from "@/lib/analytics";

export type TraceRowKey = "flow" | "oi" | "volume" | "skew" | "darkPool";

export interface TraceProps {
  bars: OhlcBar[];
  daily: DailyMetrics[];
  windowDays: string[];
  eventDate: string;
  reactionDate: string | null;
  signals: SignalBreakdown[];
  rows?: TraceRowKey[];
  priceHeight?: number;
  eventLabel: string;
  /** Show a "Replay the days" control that steps through the chart one day at a time. */
  replay?: boolean;
  /** Height of the bets row (default 92); smaller for compact cards. */
  flowHeight?: number;
  /** Tighter replay bar for small cards. */
  compact?: boolean;
}

const PAD_L = 2;
const PAD_R = 74;
const PAD_T = 34;
const ROW_HEAD = 22;
const ROW_GAP = 16;
const X_AXIS = 24;

const ROW_SPEC: Record<TraceRowKey, { label: string; height: number; signals: SignalBreakdown["key"][] }> = {
  flow: { label: "Money in large options bets", height: 92, signals: ["flowIntensity", "directionalPremium"] },
  oi: { label: "New contracts opened", height: 42, signals: ["openInterest"] },
  volume: { label: "Options volume vs. normal", height: 34, signals: ["volumeUnusualness"] },
  skew: { label: "Cost of protection (puts vs. calls)", height: 34, signals: ["skewShift"] },
  darkPool: { label: "Big off-exchange stock trades", height: 34, signals: ["darkPool"] },
};

/**
 * Exhibit A: the trace. Price on top, then one row per footprint signal, all
 * sharing the same sessions. The footprint window sits under a highlighter;
 * each row carries its contribution to the score.
 */
export function Trace(p: TraceProps) {
  const { ref, width } = useMeasure<HTMLDivElement>(960);
  const [hover, setHover] = useState<number | null>(null);
  const [step, setStep] = useState<number | null>(null);
  const m = useMemo(() => layout(p, width), [p, width]);
  const active = step ?? hover;
  const setActive = setHover;
  const lastStep = m.days.length - 1;

  // Replay: reveal one day at a time, then hold on the last day before handing back.
  useEffect(() => {
    if (step === null) return;
    const t = setTimeout(() => setStep((s) => (s === null ? null : s >= lastStep ? null : s + 1)), step >= lastStep ? 2200 : 1100);
    return () => clearTimeout(t);
  }, [step, lastStep]);

  return (
    <div ref={ref} className="relative w-full select-none">
      {p.replay ? (
        <div className={`flex flex-wrap items-center gap-3 ${p.compact ? "mb-2" : "mb-4"}`}>
          <button
            type="button"
            onClick={() => {
              if (step === null) track("replay_started", { where: p.compact ? "home" : "case" });
              setStep((s) => (s === null ? 0 : null));
            }}
            className={`pressable btn btn-soft ${p.compact ? "h-8 px-3.5 text-[13.5px]" : "h-9 px-4 text-[14px]"}`}
            aria-pressed={step !== null}
          >
            <span aria-hidden="true">{step === null ? "▶" : "■"}</span>
            {step === null ? "Replay the days" : "Stop"}
          </button>
          <p className={`min-w-[14rem] flex-1 text-ink-2 ${p.compact ? "text-[13.5px] leading-snug" : "text-[14.5px]"}`} aria-live="polite">
            {step !== null ? replayCaption(m, p, step) : p.compact ? "Watch the bets build up, day by day." : "Watch the betting build up, one trading day at a time."}
          </p>
        </div>
      ) : null}
      <svg
        width={width}
        height={m.height}
        viewBox={`0 0 ${width} ${m.height}`}
        className="block overflow-visible outline-none"
        role="img"
        aria-label={`Stock price and options betting around the ${p.eventLabel} on ${fmtDateShort(p.eventDate)}. Use the left and right arrow keys to read each day.`}
        tabIndex={0}
        onMouseLeave={() => setActive(null)}
        onMouseMove={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const i = Math.floor((e.clientX - rect.left - PAD_L) / m.slot);
          setActive(i >= 0 && i < m.days.length ? i : null);
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowRight") setActive((a) => Math.min(m.days.length - 1, (a ?? -1) + 1));
          else if (e.key === "ArrowLeft") setActive((a) => Math.max(0, (a ?? m.days.length) - 1));
          else if (e.key === "Escape") setActive(null);
        }}
        onFocus={() => setActive((a) => a ?? Math.max(0, m.days.indexOf(p.eventDate) - 1))}
        onBlur={() => setActive(null)}
      >
        {/* Footprint window: the highlighter */}
        {m.band ? (
          <g>
            <path d={bandPath(m.band.x0, m.band.x1, PAD_T - 10, m.height - X_AXIS + 2)} className="hl-band hl-band-draw" />
            <text x={m.bandLabel.x} y={m.bandLabel.y} textAnchor={m.bandLabel.anchor} className="fill-ink" fontSize="12.5" fontWeight={600}>
              {m.bandLabel.text}
            </text>
          </g>
        ) : null}

        {/* Active column */}
        {active !== null ? (
          <rect x={PAD_L + active * m.slot} y={PAD_T - 10} width={m.slot} height={m.height - X_AXIS - PAD_T + 12} className="fill-ink" opacity={0.045} rx={6} />
        ) : null}

        {/* ---------------- Price ---------------- */}
        {m.priceTicks.map((t) => (
          <g key={t}>
            <text x={PAD_L + m.plotW + 10} y={m.yPrice(t) + 4} className="fill-ink-3 tnum" fontSize="11.5">
              ${t >= 100 ? t.toFixed(0) : t.toFixed(t >= 10 ? 1 : 2)}
            </text>
          </g>
        ))}
        {m.pricePath ? (
          <path d={m.pricePath} pathLength={1} className="ink-draw stroke-ink" fill="none" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        ) : null}

        {/* Event line */}
        {m.eventX !== null ? (
          <g>
            {m.eventOnChart ? (
              <line x1={m.eventX} x2={m.eventX} y1={PAD_T - 14} y2={m.height - X_AXIS + 2} className="stroke-ink" strokeWidth="2" strokeLinecap="round" />
            ) : null}
            <text
              x={m.eventOnChart ? m.eventX + (m.eventFlip ? -7 : 7) : PAD_L + m.plotW + PAD_R - 2}
              y={14}
              textAnchor={m.eventFlip || !m.eventOnChart ? "end" : "start"}
              className="fill-ink"
              fontSize="12.5"
              fontWeight={700}
            >
              {m.eventText}
            </text>
          </g>
        ) : null}

        {/* Reaction annotation, in pen: a measuring bracket beside the event */}
        {m.reaction ? (
          <g>
            <path
              d={`M${m.reaction.bx - m.reaction.dir * 5},${m.reaction.y0} H${m.reaction.bx} V${m.reaction.y1} H${m.reaction.bx - m.reaction.dir * 5}`}
              className="stroke-pen"
              fill="none"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <circle cx={m.reaction.x1} cy={m.reaction.y1} r="4.5" className="fill-surface stroke-pen" strokeWidth="2" />
            <text
              x={m.reaction.bx + m.reaction.dir * 8}
              y={(m.reaction.y0 + m.reaction.y1) / 2 + 4}
              textAnchor={m.reaction.dir > 0 ? "start" : "end"}
              className="fill-pen stroke-surface" strokeWidth={4} paintOrder="stroke" strokeLinejoin="round"
              fontSize="12"
              fontWeight={600}
            >
              {m.reaction.label}
            </text>
          </g>
        ) : null}

        {/* ---------------- Signal rows ---------------- */}
        {m.rows.map((row) => (
          <g key={row.key}>
            <text x={PAD_L} y={row.top + 13} className="fill-ink stroke-surface" strokeWidth={4} paintOrder="stroke" strokeLinejoin="round" fontSize="13.5" fontWeight={600}>
              {ROW_SPEC[row.key].label}
              {row.key === "flow" && !m.narrow ? (
                <tspan className="fill-ink-3" fontSize="11">
                  {"  rise ↑ / fall ↓"}
                </tspan>
              ) : null}
            </text>
            {row.contribution ? (
              <text x={PAD_L + m.plotW + PAD_R - 2} y={row.top + 13} textAnchor="end" className="fill-ink tnum" fontSize="12.5" fontWeight={600}>
                {`${row.contribution.value.toFixed(0)}`}
                <tspan className="fill-ink-3" fontWeight={400}>{` of ${row.contribution.max} pts`}</tspan>
              </text>
            ) : null}
            {row.key === "flow" ? <rect x={PAD_L} y={row.base - 0.5} width={m.plotW} height={1} className="fill-ink-3" opacity={0.25} /> : null}
            {row.marks.map((mk, i) =>
              mk.kind === "bar" ? (
                <rect key={i} x={mk.x} y={mk.y} width={mk.w} height={Math.max(0.8, mk.h)} rx={2} className={mk.cls} opacity={mk.op} />
              ) : (
                <circle key={i} cx={mk.x} cy={mk.y} r={mk.r} className={mk.cls} opacity={mk.op} />
              ),
            )}
            {row.path ? <path d={row.path} className="stroke-ink-2" fill="none" strokeWidth="1.75" strokeLinejoin="round" /> : null}
            {row.afterX !== null && row.key === "flow" && PAD_L + m.plotW - row.afterX > 190 ? (
              <text x={row.afterX + 10} y={row.base - 6} className="fill-ink-3" fontSize="11.5">
                after the news (not counted)
              </text>
            ) : null}
          </g>
        ))}

        {/* Peak annotation, in pen */}
        {m.peak && (step === null || step >= m.peak.i) ? (
          <text x={m.peak.x} y={m.peak.y} textAnchor={m.peak.anchor} className="fill-pen stroke-surface" strokeWidth={4} paintOrder="stroke" strokeLinejoin="round" fontSize="11.5" fontWeight={600}>
            {m.peak.text}
          </text>
        ) : null}

        {/* ---------------- X axis ---------------- */}
        {m.days.map((d, i) =>
          m.showTick(i) ? (
            <text
              key={d}
              x={m.xOf(i)}
              y={m.height - 6}
              textAnchor="middle"
              className={d === p.eventDate ? "fill-ink" : "fill-ink-3"}
              fontSize="11.5"
              fontWeight={d === p.eventDate ? 600 : 400}
            >
              {fmtDateShort(d)}
            </text>
          ) : null,
        )}

        {/* Replay: hide the days that haven't "happened" yet */}
        {step !== null ? (
          <rect
            x={replayMaskX(m, p, step)}
            y={PAD_T - 12}
            width={Math.max(0, PAD_L + m.plotW - replayMaskX(m, p, step))}
            height={m.height - X_AXIS - PAD_T + 16}
            className="fill-surface"
            opacity={0.94}
          />
        ) : null}

        {/* Replay: row titles stay readable above the mask */}
        {step !== null
          ? m.rows.map((row) => (
              <text key={`t-${row.key}`} x={PAD_L} y={row.top + 13} className="fill-ink stroke-surface" strokeWidth={4} paintOrder="stroke" strokeLinejoin="round" fontSize="13.5" fontWeight={600}>
                {ROW_SPEC[row.key].label}
              </text>
            ))
          : null}

        {/* Crosshair dot */}
        {active !== null && m.closeOf(active) !== null ? (
          <circle cx={m.xOf(active)} cy={m.yPrice(m.closeOf(active)!)} r="4" className="fill-ink stroke-surface" strokeWidth="2" pointerEvents="none" />
        ) : null}
      </svg>

      {hover !== null && step === null ? (
        <TraceTooltip
          day={m.days[hover]}
          close={m.closeOf(hover)}
          metrics={m.metricsOf(m.days[hover])}
          left={m.xOf(hover)}
          width={width}
          inWindow={p.windowDays.includes(m.days[hover])}
          isEvent={m.days[hover] === p.eventDate}
        />
      ) : null}
    </div>
  );
}

/** Where the replay's mask starts: after the current day, and past the move label once the news is reached. */
function replayMaskX(m: ReturnType<typeof layout>, p: TraceProps, step: number): number {
  let x = PAD_L + (step + 1) * m.slot;
  const eventIdx = m.days.indexOf(p.eventDate);
  if (m.reaction && eventIdx >= 0 && step >= eventIdx && m.reaction.dir > 0) {
    x = Math.max(x, m.reaction.bx + 12 + m.reaction.label.length * 7.4);
  }
  return Math.min(x, PAD_L + m.plotW);
}

/** One plain sentence about the day the replay is on. */
function replayCaption(m: ReturnType<typeof layout>, p: TraceProps, i: number): string {
  const day = m.days[i];
  const date = fmtDateShort(day);
  if (day === p.eventDate) {
    return m.reaction ? `${date}: the news. The stock moved ${m.reaction.label.replace(" that day", "")}.` : `${date}: the news.`;
  }
  if (day > p.eventDate) return `${date}: after the news. Nothing from here counts.`;
  const mt = m.metricsOf(day);
  const counted = p.windowDays.includes(day);
  const side = (v: number, what: string) => (v > 0 ? `${money(v)} bet on a ${what}` : `no large bets on a ${what}`);
  const bets = mt && (mt.callPremium > 0 || mt.putPremium > 0) ? `${side(mt.callPremium, "rise")}, ${side(mt.putPremium, "fall")}` : "no large bets flagged";
  return counted ? `${date}: ${bets}. This day counts toward the score.` : `${date}: ${bets}. A normal day, for comparison.`;
}

function TraceTooltip(props: {
  day: string;
  close: number | null;
  metrics: DailyMetrics | null;
  left: number;
  width: number;
  inWindow: boolean;
  isEvent: boolean;
}) {
  const { day, close, metrics, left, width, inWindow, isEvent } = props;
  const flip = left > width * 0.6;
  return (
    <div
      role="status"
      className="pop pointer-events-none absolute top-8 z-10 w-64 p-3.5 text-[13px]"
      style={flip ? { right: width - left + 14 } : { left: left + 14 }}
    >
      <div className="mb-2 flex items-center justify-between">
        <span className="font-semibold text-ink">{fmtDateShort(day)}</span>
        <span className={`rounded-full px-2 py-0.5 text-[11.5px] font-medium ${isEvent ? "bg-ink text-surface" : inWindow ? "bg-hl text-ink" : "bg-surface-2 text-ink-3"}`}>
          {isEvent ? "news day" : inWindow ? "counted" : "normal period"}
        </span>
      </div>
      <TipRow label="Close" value={close !== null ? `$${close.toFixed(2)}` : "—"} />
      {metrics ? (
        <>
          <TipRow label="Bets on a rise" value={fmtMoney(metrics.callPremium)} swatch="call" />
          <TipRow label="Bets on a fall" value={fmtMoney(metrics.putPremium)} swatch="put" />
          <TipRow label="Large bets" value={String(metrics.alertCount)} />
          <TipRow label="New contracts" value={fmtInt(metrics.oiAbs)} />
          {metrics.volumePercentile !== null ? <TipRow label="Volume vs. normal" value={`${metrics.volumePercentile}th pct`} /> : null}
          <TipRow label="Big off-exchange trades" value={metrics.darkPoolNotional > 0 ? fmtMoney(metrics.darkPoolNotional) : "—"} />
        </>
      ) : (
        <p className="mt-1 text-ink-3">{isEvent ? "The news came out. Nothing from here on counts toward the score." : "After the news, so not counted."}</p>
      )}
    </div>
  );
}

function TipRow({ label, value, swatch }: { label: string; value: string; swatch?: "call" | "put" }) {
  return (
    <div className="flex items-center justify-between gap-3 py-[3px]">
      <span className="flex items-center gap-1.5 text-ink-2">
        {swatch ? <span className={`h-2 w-2 rounded-full ${swatch === "call" ? "bg-call" : "bg-put"}`} aria-hidden="true" /> : null}
        {label}
      </span>
      <span className="font-medium text-ink tnum">{value}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Geometry
// ---------------------------------------------------------------------------

type Mark =
  | { kind: "bar"; x: number; y: number; w: number; h: number; cls: string; op: number }
  | { kind: "dot"; x: number; y: number; r: number; cls: string; op: number };

function layout(p: TraceProps, width: number) {
  const rowKeys = p.rows ?? (["flow", "oi", "volume", "skew", "darkPool"] as TraceRowKey[]);
  const metricsByDate = new Map(p.daily.map((d) => [d.date, d]));
  let days = p.bars.map((b) => b.date);
  if (days.length === 0) days = p.daily.map((d) => d.date).slice(-10);
  const n = Math.max(1, days.length);
  const plotW = Math.max(160, width - PAD_L - PAD_R);
  const slot = plotW / n;
  const xOf = (i: number) => PAD_L + slot * i + slot / 2;
  const priceH = p.priceHeight ?? 168;
  const windowSet = new Set(p.windowDays);

  // Price scale
  const closes = p.bars.map((b) => b.close);
  const lo = closes.length ? Math.min(...closes) : 0;
  const hi = closes.length ? Math.max(...closes) : 1;
  const pad = Math.max((hi - lo) * 0.12, hi * 0.01);
  const pLo = lo - pad;
  const pHi = hi + pad;
  const yPrice = (v: number) => PAD_T + (1 - (v - pLo) / (pHi - pLo || 1)) * priceH;
  const priceTicks = niceTicks(lo, hi, 3);
  const pricePath = closes.length
    ? closes.map((c, i) => `${i === 0 ? "M" : "L"}${xOf(i).toFixed(1)},${yPrice(c).toFixed(1)}`).join(" ")
    : null;

  // Event
  const eventIdx = days.indexOf(p.eventDate);
  const eventOnChart = eventIdx >= 0;
  const lastDay = days[days.length - 1];
  const eventX = eventOnChart ? xOf(eventIdx) : lastDay && p.eventDate > lastDay ? PAD_L + plotW - 1 : null;
  let eventFlip = eventX !== null && eventX > PAD_L + plotW * 0.82;
  const eventText = eventOnChart ? "The news" : `News on ${fmtDateShort(p.eventDate)} →`;

  // Footprint band
  const winIdx = days.map((d, i) => (windowSet.has(d) ? i : -1)).filter((i) => i >= 0);
  const band = winIdx.length
    ? { x0: PAD_L + Math.min(...winIdx) * slot + 1, x1: PAD_L + (Math.max(...winIdx) + 1) * slot - 1 }
    : null;

  // Top labels: keep "5 days before" and "The news" from running into each
  // other when the news day sits right after the highlighted days.
  const narrow = width < 640;
  const partial = !eventOnChart;
  const bandText = partial ? (narrow ? "So far" : "Counted so far") : narrow ? "5 days before" : "The 5 trading days before the news";
  const textW = (t: string) => t.length * 7.1;
  let bandLabel = { x: (band?.x0 ?? 0) + 8, y: 14, anchor: "start" as "start" | "end", text: bandText };
  if (band && eventX !== null) {
    const evW = textW(eventText);
    const evStart = !eventOnChart ? PAD_L + plotW + PAD_R - 2 - evW : eventFlip ? eventX - 7 - evW : eventX + 7;
    if (bandLabel.x + textW(bandText) > evStart - 8) {
      const roomRight = PAD_L + plotW + PAD_R - (eventX + 7);
      if (eventOnChart && roomRight >= evW) eventFlip = false;
      bandLabel = eventFlip || !eventOnChart
        ? { ...bandLabel, y: 28 }
        : { x: Math.min(band.x1, eventX) - 8, y: 14, anchor: "end", text: bandText };
    }
  }

  // Reaction
  let reaction: { y0: number; x1: number; y1: number; bx: number; dir: 1 | -1; label: string } | null = null;
  if (p.reactionDate) {
    const ri = days.indexOf(p.reactionDate);
    if (ri > 0) {
      const from = closes[ri - 1];
      const to = closes[ri];
      const pct = ((to - from) / from) * 100;
      const short = `${pct >= 0 ? "+" : "−"}${Math.abs(pct).toFixed(1)}%`;
      const label = width < 640 ? short : `${short} that day`;
      const textW = label.length * 7.4 + 12;
      const gap = Math.min(14, slot * 0.45);
      const roomRight = PAD_L + plotW + PAD_R - (xOf(ri) + gap + 8);
      const dir: 1 | -1 = roomRight >= textW ? 1 : -1;
      reaction = { y0: yPrice(from), x1: xOf(ri), y1: yPrice(to), bx: xOf(ri) + dir * gap, dir, label };
    }
  }

  // Signal rows
  const contributionFor = (key: TraceRowKey) => {
    const keys = ROW_SPEC[key].signals;
    const sig = p.signals.filter((s) => keys.includes(s.key));
    if (!sig.length) return null;
    return {
      value: sig.reduce((a, s) => a + s.contribution, 0),
      max: Math.round(sig.reduce((a, s) => a + s.weight, 0) * 100),
    };
  };

  let y = PAD_T + priceH + ROW_GAP + 6;
  const barW = Math.max(3, Math.min(20, slot * 0.56));
  let peak: { x: number; y: number; text: string; anchor: "start" | "middle" | "end"; i: number } | null = null;
  const firstAfter = eventOnChart ? eventIdx : -1;
  const afterX = firstAfter >= 0 && n - firstAfter >= 3 ? PAD_L + firstAfter * slot + slot / 2 : null;

  const rows = rowKeys.map((key) => {
    const spec = ROW_SPEC[key];
    const top = y;
    const plotTop = top + ROW_HEAD;
    const h = key === "flow" && p.flowHeight ? p.flowHeight : spec.height;
    const marks: Mark[] = [];
    let path: string | null = null;
    let base = plotTop + h;

    const val = (d: string) => metricsByDate.get(d);
    const opFor = (d: string) => (windowSet.has(d) ? 1 : 0.32);

    if (key === "flow") {
      const mid = plotTop + h / 2;
      base = mid;
      const max = Math.max(1, ...days.map((d) => Math.max(val(d)?.callPremium ?? 0, val(d)?.putPremium ?? 0)));
      const half = h / 2 - 2;
      let best = 0;
      days.forEach((d, i) => {
        const mt = val(d);
        if (!mt) return;
        const x = xOf(i) - barW / 2;
        const ch = (mt.callPremium / max) * half;
        const ph = (mt.putPremium / max) * half;
        if (ch > 0) marks.push({ kind: "bar", x, y: mid - ch - 1, w: barW, h: ch, cls: "fill-call", op: opFor(d) });
        if (ph > 0) marks.push({ kind: "bar", x, y: mid + 1, w: barW, h: ph, cls: "fill-put", op: opFor(d) });
        const v = Math.max(mt.callPremium, mt.putPremium);
        if (windowSet.has(d) && v > best) {
          best = v;
          const isCall = mt.callPremium >= mt.putPremium;
          const flip = i > n * 0.6;
          peak = {
            x: flip ? x - 6 : x + barW + 6,
            y: isCall ? mid - ch + 9 : mid + ph - 1,
            text: `${money(v)} on a ${isCall ? "rise" : "fall"}`,
            anchor: flip ? "end" : "start",
            i,
          };
        }
      });
    } else if (key === "skew") {
      const pts = days
        .map((d, i) => ({ d, i, v: val(d)?.skew }))
        .filter((q): q is { d: string; i: number; v: number } => typeof q.v === "number");
      if (pts.length) {
        const sLo = Math.min(...pts.map((q) => q.v));
        const sHi = Math.max(...pts.map((q) => q.v));
        const ys = (v: number) => plotTop + 3 + (1 - (v - sLo) / (sHi - sLo || 1)) * (h - 6);
        path = pts.map((q, k) => `${k === 0 ? "M" : "L"}${xOf(q.i).toFixed(1)},${ys(q.v).toFixed(1)}`).join(" ");
        for (const q of pts) marks.push({ kind: "dot", x: xOf(q.i), y: ys(q.v), r: windowSet.has(q.d) ? 3 : 2.2, cls: windowSet.has(q.d) ? "fill-ink" : "fill-ink-3", op: 1 });
      }
    } else {
      const get = (mt: DailyMetrics) =>
        key === "oi" ? mt.oiAbs : key === "volume" ? (mt.volumePercentile ?? 0) : mt.darkPoolNotional;
      const max = key === "volume" ? 100 : Math.max(1, ...days.map((d) => (val(d) ? get(val(d)!) : 0)));
      days.forEach((d, i) => {
        const mt = val(d);
        if (!mt) return;
        const v = get(mt);
        const bh = (v / max) * (h - 2);
        if (bh <= 0) return;
        marks.push({ kind: "bar", x: xOf(i) - barW / 2, y: base - bh, w: barW, h: bh, cls: windowSet.has(d) ? "fill-ink" : "fill-ink-3", op: windowSet.has(d) ? 0.92 : 0.45 });
      });
    }
    y = plotTop + h + ROW_GAP;
    return { key, top, base, marks, path, contribution: contributionFor(key), afterX };
  });

  const height = y - ROW_GAP + 8 + X_AXIS;
  const peakLabel = peak as { x: number; y: number; text: string; anchor: "start" | "middle" | "end"; i: number } | null;
  if (peakLabel && eventX !== null && peakLabel.anchor === "start") {
    const w = peakLabel.text.length * 7.2;
    if (peakLabel.x < eventX && peakLabel.x + w > eventX - 4) {
      peakLabel.anchor = "end";
      peakLabel.x = peakLabel.x - barW - 12;
    }
  }
  const tickEvery = slot >= 46 ? 1 : slot >= 26 ? 2 : 3;

  return {
    days,
    slot,
    plotW,
    xOf,
    yPrice,
    priceTicks,
    pricePath,
    eventX,
    eventOnChart,
    eventFlip,
    eventText,
    bandLabel,
    band,
    reaction,
    rows,
    peak: peakLabel,
    height,
    narrow,
    showTick: (i: number) =>
      days[i] === p.eventDate || (i % tickEvery === 0 && (eventIdx < 0 || Math.abs(i - eventIdx) >= Math.max(1, tickEvery))),
    closeOf: (i: number) => (i >= 0 && i < closes.length ? closes[i] : null),
    metricsOf: (d: string) => metricsByDate.get(d) ?? null,
  };
}

function niceTicks(lo: number, hi: number, count: number): number[] {
  const span = hi - lo;
  if (span <= 0) return [lo];
  const pow = 10 ** Math.floor(Math.log10(span / count));
  const ticksFor = (step: number) => {
    const out: number[] = [];
    for (let v = Math.ceil(lo / step - 1e-9) * step; v <= hi + 1e-9; v += step) out.push(Number(v.toFixed(6)));
    return out;
  };
  // The roundest step that still labels at least two prices.
  const steps = [10, 5, 2.5, 2, 1, 0.5].map((k) => k * pow);
  for (const step of steps) {
    const out = ticksFor(step);
    if (out.length >= 2 && out.length <= count + 1) return out;
  }
  return ticksFor(steps[steps.length - 1]);
}

import type { Direction, Verdict } from "@foreshadow/core";
import { Highlight } from "./Highlight";
import { DIRECTION_LABELS, KIND_LABELS, VERDICT_LABELS } from "@/lib/format";

/** Scores of 70+ get the highlighter: that's where someone knew. */
export function ScoreFigure({ score, size = "md", draw = false }: { score: number; size?: "sm" | "md" | "lg" | "xl"; draw?: boolean }) {
  const cls =
    size === "xl" ? "text-[112px]" : size === "lg" ? "text-[64px]" : size === "md" ? "text-[30px]" : "text-[22px]";
  const n = score.toFixed(0);
  const tone = score >= 70 ? "text-ink" : score >= 40 ? "text-ink" : "text-ink-3";
  return (
    <span className={`numeral tnum ${cls} ${tone}`} aria-label={`Score ${n} out of 100`}>
      {score >= 70 ? <Highlight draw={draw}>{n}</Highlight> : n}
    </span>
  );
}

export function bandName(score: number): string {
  return score >= 70 ? "Someone knew" : score >= 40 ? "Notable" : "Quiet";
}

export function DirectionMark({ direction, short = false }: { direction: Direction; short?: boolean }) {
  const glyph = direction === "bullish" ? "▲" : direction === "bearish" ? "▼" : "◆";
  const tone = direction === "bullish" ? "text-call" : direction === "bearish" ? "text-put" : "text-ink-3";
  return (
    <span className="inline-flex items-center gap-1.5 text-[12.5px] text-ink-2">
      <span className={`${tone} text-[10px]`} aria-hidden="true">
        {glyph}
      </span>
      {short ? <span className="sr-only">{DIRECTION_LABELS[direction]}</span> : DIRECTION_LABELS[direction]}
    </span>
  );
}

export function VerdictMark({ verdict }: { verdict: Verdict }) {
  if (verdict === "matched") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-[5px] bg-ink px-2 py-[3px] text-[12px] font-medium text-surface">
        <svg width="10" height="10" viewBox="0 0 12 12" aria-hidden="true">
          <path d="M2 6.5 4.8 9 10 3" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        Matched
      </span>
    );
  }
  if (verdict === "missed") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-[5px] border border-line-strong px-2 py-[2px] text-[12px] text-ink-2">
        <svg width="9" height="9" viewBox="0 0 12 12" aria-hidden="true">
          <path d="M3 3l6 6M9 3l-6 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
        Missed
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-[5px] px-1 py-[2px] text-[12px] text-ink-3">
      <span className="h-1.5 w-1.5 rounded-full border border-current" aria-hidden="true" />
      {VERDICT_LABELS[verdict]}
    </span>
  );
}

export function KindTag({ kind }: { kind: string }) {
  return (
    <span className="inline-flex items-center rounded-[4px] border border-line-strong px-1.5 py-px font-mono text-[10px] font-medium uppercase tracking-wider text-ink-2">
      {KIND_LABELS[kind] ?? kind}
    </span>
  );
}

export function WindowMeter({ elapsed, total }: { elapsed: number; total: number }) {
  return (
    <span className="inline-flex items-center gap-[3px]" title={`${elapsed} of ${total} footprint days observed`}>
      <span className="sr-only">{`${elapsed} of ${total} footprint days observed`}</span>
      {Array.from({ length: total }).map((_, i) => (
        <span key={i} aria-hidden="true" className={`h-3 w-[7px] -skew-x-6 rounded-[2px] ${i < elapsed ? "bg-hl" : "border border-line-strong"}`} />
      ))}
    </span>
  );
}

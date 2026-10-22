import type { Direction, Verdict } from "@foreshadow/core";
import { directionPlain, OUTCOME_PLAIN, OUTCOME_SHORT, outcomeOf } from "@/lib/plain";
import { KIND_LABELS } from "@/lib/format";

/** The 0–100 score. 70+ gets the one highlighter on the page. */
export function ScoreFigure({ score, size = "md" }: { score: number; size?: "sm" | "md" | "lg" | "xl"; draw?: boolean }) {
  const cls = size === "xl" ? "text-[76px]" : size === "lg" ? "text-[48px]" : size === "md" ? "text-[24px]" : "text-[18px]";
  const n = score.toFixed(0);
  return (
    <span className={`numeral ${cls} ${score >= 40 ? "text-ink" : "text-ink-3"}`} aria-label={`Score ${n} out of 100`}>
      {score >= 70 ? <span className="hl">{n}</span> : n}
    </span>
  );
}

export function DirectionMark({ direction, short = false }: { direction: Direction; short?: boolean }) {
  const glyph = direction === "bullish" ? "↑" : direction === "bearish" ? "↓" : "↕";
  const tone = direction === "bullish" ? "text-call-ink" : direction === "bearish" ? "text-put-ink" : "text-ink-3";
  return (
    <span className="inline-flex items-center gap-1 text-ink-2">
      <span className={`${tone} font-bold`} aria-hidden="true">{glyph}</span>
      {short ? <span className="sr-only">{directionPlain(direction)}</span> : directionPlain(direction)}
    </span>
  );
}

/**
 * The result as a small pill: Right, Right way (small move), Wrong way,
 * or Waiting. Direction colours stay reserved for calls and puts.
 */
export function VerdictMark({
  verdict,
  direction = "mixed",
  realizedMovePct = null,
  size = "md",
}: {
  verdict: Verdict;
  direction?: Direction;
  realizedMovePct?: number | null;
  size?: "md" | "lg";
}) {
  const o = outcomeOf({ verdict, direction, realizedMovePct });
  const tone =
    o === "right" ? "bg-ink text-surface" : o === "rightWay" ? "bg-surface-3 text-ink" : o === "wrongWay" ? "bg-surface-2 text-ink-2" : "bg-surface-2 text-ink-3";
  const mark = o === "right" ? "✓" : o === "rightWay" ? "≈" : o === "wrongWay" ? "✗" : o === "pending" ? "…" : "–";
  const pad = size === "lg" ? "h-9 px-4 text-[16px]" : "h-7 px-3 text-[13.5px]";
  return (
    <span className={`inline-flex w-fit items-center gap-1.5 whitespace-nowrap rounded-full font-semibold ${pad} ${tone}`} title={OUTCOME_PLAIN[o]}>
      <span aria-hidden="true">{mark}</span>
      {o === "rightWay" ? "Right way" : OUTCOME_SHORT[o]}
    </span>
  );
}

export function KindTag({ kind }: { kind: string }) {
  return (
    <span className="inline-flex h-[22px] items-center rounded-full bg-surface-2 px-2.5 text-[12px] font-medium text-ink-2">
      {KIND_LABELS[kind] ?? kind}
    </span>
  );
}

export function WindowMeter({ elapsed, total }: { elapsed: number; total: number }) {
  return (
    <span className="inline-flex items-center gap-1" title={`${elapsed} of ${total} days before the news have passed`}>
      <span className="sr-only">{`${elapsed} of ${total} days before the news have passed`}</span>
      {Array.from({ length: total }).map((_, i) => (
        <span key={i} aria-hidden="true" className={`h-2.5 w-2.5 rounded-full ${i < elapsed ? "bg-ink" : "bg-surface-3"}`} />
      ))}
    </span>
  );
}

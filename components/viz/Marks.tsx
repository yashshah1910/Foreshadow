import type { Direction, Verdict } from "@foreshadow/core";
import { directionPlain, scoreWord, verdictShort } from "@/lib/plain";
import { KIND_LABELS } from "@/lib/format";

/** The 0–100 score. 70+ gets the one highlighter on the page. */
export function ScoreFigure({ score, size = "md" }: { score: number; size?: "sm" | "md" | "lg" | "xl"; draw?: boolean }) {
  const cls = size === "xl" ? "text-[76px]" : size === "lg" ? "text-[48px]" : size === "md" ? "text-[22px]" : "text-[17px]";
  const n = score.toFixed(0);
  return (
    <span className={`numeral tnum ${cls} ${score >= 40 ? "text-ink" : "text-ink-3"}`} aria-label={`Score ${n} out of 100`}>
      {score >= 70 ? <span className="hl">{n}</span> : n}
    </span>
  );
}

export function bandName(score: number): string {
  return scoreWord(score);
}

export function DirectionMark({ direction, short = false }: { direction: Direction; short?: boolean }) {
  const glyph = direction === "bullish" ? "↑" : direction === "bearish" ? "↓" : "·";
  const tone = direction === "bullish" ? "text-call" : direction === "bearish" ? "text-put" : "text-ink-3";
  return (
    <span className="inline-flex items-center gap-1 text-ink-2">
      <span className={`${tone} font-semibold`} aria-hidden="true">{glyph}</span>
      {short ? <span className="sr-only">{directionPlain(direction)}</span> : directionPlain(direction)}
    </span>
  );
}

export function VerdictMark({ verdict }: { verdict: Verdict }) {
  const tone =
    verdict === "matched" ? "text-ink font-semibold" : verdict === "missed" ? "text-ink-2" : "text-ink-3";
  const mark = verdict === "matched" ? "✓" : verdict === "missed" ? "✗" : "…";
  return (
    <span className={`inline-flex items-center gap-1.5 ${tone}`}>
      <span aria-hidden="true">{mark}</span>
      {verdictShort(verdict)}
    </span>
  );
}

export function KindTag({ kind }: { kind: string }) {
  return <span className="text-ink-3">{KIND_LABELS[kind] ?? kind}</span>;
}

export function WindowMeter({ elapsed, total }: { elapsed: number; total: number }) {
  return (
    <span className="inline-flex items-center gap-[3px]" title={`${elapsed} of ${total} days before the news have passed`}>
      <span className="sr-only">{`${elapsed} of ${total} days before the news have passed`}</span>
      {Array.from({ length: total }).map((_, i) => (
        <span key={i} aria-hidden="true" className={`h-2.5 w-2.5 rounded-full ${i < elapsed ? "bg-ink" : "border border-line-strong"}`} />
      ))}
    </span>
  );
}

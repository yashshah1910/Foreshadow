import type { StripDay } from "@/lib/data";
import { fmtDateShort, fmtMoney } from "@/lib/format";
import { bandPath } from "./Highlight";

/**
 * The tell strip: flow-alert premium for the ten sessions before an event,
 * calls up, puts down. The last five (the footprint window) sit on a
 * highlighter swipe; earlier days are the baseline, drawn faint.
 */
export function TellStrip({ days, width = 140, height = 34 }: { days: StripDay[]; width?: number; height?: number }) {
  const n = days.length || 1;
  const tickGap = 9;
  const gap = 2;
  const bw = Math.max(3, (width - tickGap - gap * (n - 1)) / n);
  const mid = height / 2;
  const max = Math.max(1, ...days.map((d) => Math.max(d.call, d.put)));
  const half = mid - 2;
  const xOf = (i: number) => i * (bw + gap);
  const first = days.findIndex((d) => d.inWindow);
  const last = days.length - 1;
  const winTotal = days.filter((d) => d.inWindow).reduce((s, d) => s + d.call + d.put, 0);
  const label = `Flow premium in the ten sessions before the event. Footprint window total ${fmtMoney(winTotal)}.`;
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={label} className="block overflow-visible">
      <title>{label}</title>
      {first >= 0 ? <path d={bandPath(xOf(first) - 2.5, xOf(last) + bw + 2.5, 0.5, height - 0.5)} className="hl-band" /> : null}
      <line x1={0} x2={width - tickGap + 2} y1={mid} y2={mid} className="stroke-line-strong" strokeWidth="1" />
      {days.map((d, i) => {
        const x = xOf(i);
        if (d.future) {
          return <rect key={d.date} x={x + 0.5} y={mid - 2.5} width={bw - 1} height={5} rx={1.5} className="fill-none stroke-ink-3" strokeWidth="1" />;
        }
        const ch = (d.call / max) * half;
        const ph = (d.put / max) * half;
        const op = d.inWindow ? 1 : 0.35;
        return (
          <g key={d.date} opacity={op}>
            <title>{`${fmtDateShort(d.date)} · calls ${fmtMoney(d.call)} · puts ${fmtMoney(d.put)}`}</title>
            {ch > 0.4 ? <rect x={x} y={mid - ch - 0.5} width={bw} height={ch} rx={1.2} className="fill-call" /> : null}
            {ph > 0.4 ? <rect x={x} y={mid + 0.5} width={bw} height={ph} rx={1.2} className="fill-put" /> : null}
          </g>
        );
      })}
      <line x1={width - 2} x2={width - 2} y1={2} y2={height - 2} className="stroke-ink" strokeWidth="1.75" strokeLinecap="round" />
    </svg>
  );
}

"use client";

import Link from "next/link";
import type { EventSummary } from "@/lib/data";
import { useMeasure } from "@/lib/hooks/useMeasure";
import { fmtDate } from "@/lib/format";

/**
 * Every case for a ticker on one axis: x = date, y = score. The 70–100 zone
 * wears the highlighter; matched cases get a ring.
 */
export function Timeline({ events }: { events: EventSummary[] }) {
  const { ref, width } = useMeasure<HTMLDivElement>(1100);
  const sorted = [...events].sort((a, b) => a.catalyst.eventDate.localeCompare(b.catalyst.eventDate));
  const H = 250;
  const PL = 30;
  const PR = 18;
  const PT = 14;
  const PB = 30;
  const t0 = sorted.length ? Date.parse(sorted[0].catalyst.eventDate) : 0;
  const t1 = sorted.length ? Date.parse(sorted[sorted.length - 1].catalyst.eventDate) : 1;
  const span = Math.max(1, t1 - t0);
  const x = (d: string) => PL + 10 + ((Date.parse(d) - t0) / span) * (width - PL - PR - 20);
  const y = (s: number) => PT + (1 - s / 100) * (H - PT - PB);
  return (
    <div ref={ref} className="w-full">
      <svg width={width} height={H} viewBox={`0 0 ${width} ${H}`} role="group" aria-label="Score of every case over time; each dot links to its case" className="block">
        <rect x={PL} y={y(100)} width={width - PL - PR} height={y(70) - y(100)} rx={8} className="hl-band" />
        {[0, 40, 70, 100].map((v) => (
          <g key={v}>
            <text x={PL - 8} y={y(v) + 4} textAnchor="end" className="fill-ink-3 tnum" fontSize="11.5">
              {v}
            </text>
          </g>
        ))}
        <text x={width - PR - 4} y={y(100) + 13} textAnchor="end" className="fill-ink" fontSize="12.5" fontWeight={600}>
          very unusual
        </text>
        {sorted.length ? (
          <>
            <text x={PL + 10} y={H - 8} className="fill-ink-3" fontSize="11.5">
              {fmtDate(sorted[0].catalyst.eventDate, { year: true })}
            </text>
            <text x={width - PR - 10} y={H - 8} textAnchor="end" className="fill-ink-3" fontSize="11.5">
              {fmtDate(sorted[sorted.length - 1].catalyst.eventDate, { year: true })}
            </text>
          </>
        ) : null}
        {sorted.map((e) => {
          const cx = x(e.catalyst.eventDate);
          const cy = y(e.score);
          const tone = e.direction === "bullish" ? "fill-call" : e.direction === "bearish" ? "fill-put" : "fill-ink-3";
          return (
            <Link key={e.catalyst.id} href={`/event/${encodeURIComponent(e.catalyst.id)}`} aria-label={`${fmtDate(e.catalyst.eventDate, { year: true })}, ${e.catalyst.title}, score ${e.score.toFixed(0)}, ${e.verdict}`}>
              <g>
                <title>{`${fmtDate(e.catalyst.eventDate, { year: true })}: ${e.catalyst.title}, score ${e.score.toFixed(0)}`}</title>
                <rect x={cx - 1} y={cy} width={2} height={Math.max(0, y(0) - cy)} rx={1} className="fill-surface-3" />
                {e.verdict === "matched" ? <circle cx={cx} cy={cy} r="9.5" className="fill-none stroke-ink" strokeWidth="1.5" /> : null}
                <circle cx={cx} cy={cy} r={e.partialWindow ? 4 : 5.5} className={e.partialWindow ? "fill-surface stroke-ink-2" : `${tone} stroke-surface`} strokeWidth="2" />
                <rect x={cx - 14} y={cy - 14} width="28" height="28" fill="transparent" />
              </g>
            </Link>
          );
        })}
      </svg>
    </div>
  );
}

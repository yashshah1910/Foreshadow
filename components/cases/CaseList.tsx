import Link from "next/link";
import type { EventSummary, RadarItem } from "@/lib/data";
import { fmtDate, fmtPct } from "@/lib/format";
import { TellStrip } from "@/components/viz/TellStrip";
import { MoveGauge } from "@/components/viz/MoveGauge";
import { DirectionMark, KindTag, ScoreFigure, VerdictMark, WindowMeter } from "@/components/viz/Marks";

type Row = EventSummary | RadarItem;

function isRadar(r: Row): r is RadarItem {
  return "daysElapsed" in r;
}

/**
 * The case log: one row per scored catalyst. Shared by the leaderboard, the
 * dossier, the radar and the landing page so they read as one system.
 */
export function CaseList({
  rows,
  animate = true,
  mode = "past",
  empty,
  showYear = false,
}: {
  rows: Row[];
  animate?: boolean;
  mode?: "past" | "live";
  empty?: React.ReactNode;
  showYear?: boolean;
}) {
  if (rows.length === 0) {
    return (
      <div className="sheet px-6 py-12 text-center">
        {empty ?? (
          <>
            <p className="text-[15px] text-ink">No catalysts match these filters.</p>
            <p className="mt-1 text-[13px] text-ink-2">Widen the window or clear the score and verdict filters.</p>
          </>
        )}
      </div>
    );
  }
  return (
    <div className="sheet overflow-hidden">
      <div className="hidden grid-cols-[4.75rem_minmax(0,1fr)_9.75rem_10.5rem_6.75rem] items-end gap-5 border-b hairline px-5 pb-2.5 pt-3 lg:grid">
        <span className="label">Score</span>
        <span className="label">Catalyst</span>
        <span className="label">10 sessions before</span>
        <span className="label">{mode === "live" ? "Implied move" : "Implied vs moved"}</span>
        <span className="label">{mode === "live" ? "Window" : "Verdict"}</span>
      </div>
      <ol>
        {rows.map((r, i) => (
          <li key={r.catalyst.id} className={animate ? "rise" : undefined} style={animate ? ({ "--i": i } as React.CSSProperties) : undefined}>
            <Link
              href={`/event/${encodeURIComponent(r.catalyst.id)}`}
              className="group grid grid-cols-[3.75rem_minmax(0,1fr)] items-center gap-x-4 gap-y-3 border-b hairline px-4 py-4 transition-colors duration-150 last:border-b-0 hover:bg-surface-2 sm:px-5 lg:grid-cols-[4.75rem_minmax(0,1fr)_9.75rem_10.5rem_6.75rem] lg:gap-x-5 lg:py-3.5"
            >
              <span className="self-start pt-0.5 lg:self-center lg:pt-0">
                {r.partialWindow && r.flags.footprintDaysUsed === 0 ? (
                  <span className="numeral text-[30px] text-ink-3" aria-label="Not scored yet">—</span>
                ) : (
                  <ScoreFigure score={r.score} />
                )}
              </span>
              <span className="min-w-0">
                <span className="flex items-baseline gap-2">
                  <span className="font-mono text-[14px] font-semibold text-ink">{r.catalyst.ticker}</span>
                  <span className="truncate text-[14px] text-ink">{r.catalyst.title}</span>
                </span>
                <span className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[12.5px] text-ink-3">
                  <KindTag kind={r.catalyst.kind} />
                  <span className="tnum">{fmtDate(r.catalyst.eventDate, { weekday: mode === "live", year: showYear })}</span>
                  <DirectionMark direction={r.direction} />
                  {r.company ? <span className="hidden truncate sm:inline">{r.company.name}</span> : null}
                </span>
              </span>
              <span className="col-span-2 flex items-center gap-4 lg:col-span-1">
                <TellStrip days={r.strip} />
                <span className="flex flex-col gap-1.5 lg:hidden">
                  <MoveGauge implied={r.impliedMovePct} realized={mode === "live" ? null : r.realizedMovePct} width={88} />
                  <span className="font-mono text-[11px] text-ink-3 tnum">
                    {mode === "live" ? `±${fmtPct(r.impliedMovePct, { sign: false })} implied` : `±${fmtPct(r.impliedMovePct, { sign: false })} → ${fmtPct(r.realizedMovePct)}`}
                  </span>
                </span>
                <span className="ml-auto lg:hidden">
                  {mode === "live" && isRadar(r) ? <WindowMeter elapsed={r.daysElapsed} total={r.daysTotal} /> : <VerdictMark verdict={r.verdict} />}
                </span>
              </span>
              <span className="hidden flex-col gap-1.5 lg:flex">
                <MoveGauge implied={r.impliedMovePct} realized={mode === "live" ? null : r.realizedMovePct} />
                <span className="font-mono text-[11.5px] text-ink-3 tnum">
                  ±{fmtPct(r.impliedMovePct, { sign: false })}
                  {mode === "live" ? " implied" : (
                    <>
                      <span className="mx-1">→</span>
                      <span className={r.verdict === "matched" ? "text-ink" : "text-ink-2"}>{fmtPct(r.realizedMovePct)}</span>
                    </>
                  )}
                </span>
              </span>
              <span className="hidden lg:block">
                {mode === "live" && isRadar(r) ? (
                  <span className="flex flex-col gap-1">
                    <WindowMeter elapsed={r.daysElapsed} total={r.daysTotal} />
                    <span className="font-mono text-[11px] text-ink-3 tnum">{r.daysElapsed}/{r.daysTotal} days in</span>
                  </span>
                ) : (
                  <VerdictMark verdict={r.verdict} />
                )}
              </span>
            </Link>
          </li>
        ))}
      </ol>
    </div>
  );
}

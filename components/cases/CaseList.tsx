import Link from "next/link";
import type { EventSummary, RadarItem } from "@/lib/data";
import { fmtDate, fmtPct } from "@/lib/format";
import { eventName } from "@/lib/plain";
import { TellStrip } from "@/components/viz/TellStrip";
import { DirectionMark, KindTag, ScoreFigure, VerdictMark, WindowMeter } from "@/components/viz/Marks";

type Row = EventSummary | RadarItem;

function isRadar(r: Row): r is RadarItem {
  return "daysElapsed" in r;
}

const COLS = "lg:grid-cols-[minmax(0,1fr)_7.5rem_9.5rem_9.5rem_7rem]";

/** One white row per case on a soft tray, shared by every list on the site. */
export function CaseList({
  rows,
  mode = "past",
  empty,
  showYear = false,
  header = true,
}: {
  rows: Row[];
  animate?: boolean;
  mode?: "past" | "live";
  empty?: React.ReactNode;
  showYear?: boolean;
  /** Column labels above the rows; turn off for the second and later groups on a page. */
  header?: boolean;
}) {
  if (rows.length === 0) {
    return (
      <div className="tray px-6 py-14 text-center">
        {empty ?? (
          <>
            <p className="text-[16px] font-medium text-ink">Nothing matches these filters.</p>
            <p className="mt-1 text-[15px] text-ink-3">Try a longer time range, or turn off a filter.</p>
          </>
        )}
      </div>
    );
  }
  const live = mode === "live";
  return (
    <div className="tray p-2 sm:p-2.5">
      <div className={`hidden gap-6 px-5 pb-2 pt-2 text-[13px] font-medium text-ink-3 ${header ? "lg:grid" : ""} ${COLS}`}>
        <span>Stock and news</span>
        <span>Unusual betting</span>
        <span>Betting, 10 days before</span>
        <span>{live ? "Expected move" : "Expected, then actual"}</span>
        <span>{live ? "Days in" : "The bets were"}</span>
      </div>
      <ol className="grid gap-1.5">
        {rows.map((r) => (
          <li key={r.catalyst.id}>
            <Link
              href={`/event/${encodeURIComponent(r.catalyst.id)}`}
              className={`card group grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-6 gap-y-3 px-4 py-4 transition-shadow duration-200 hover:shadow-[0_2px_12px_rgba(19,23,34,0.08)] sm:px-5 ${COLS}`}
            >
              <span className="min-w-0">
                <span className="flex items-baseline gap-2">
                  <span className="ticker text-[16px] text-ink">{r.catalyst.ticker}</span>
                  <span className="min-w-0 text-[16px] leading-snug text-ink group-hover:underline group-hover:decoration-ink/30 group-hover:underline-offset-4 lg:truncate">{eventName(r)}</span>
                </span>
                <span className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[13.5px] text-ink-3">
                  <KindTag kind={r.catalyst.kind} />
                  <span className="tnum">{fmtDate(r.catalyst.eventDate, { weekday: live, year: showYear })}</span>
                  {r.company ? <span className="hidden truncate sm:inline">{r.company.name}</span> : null}
                </span>
              </span>
              <span className="text-right lg:text-left">
                {r.partialWindow && r.flags.footprintDaysUsed === 0 ? (
                  <span className="text-[14px] text-ink-3">not yet</span>
                ) : (
                  <span className="flex items-baseline gap-2 lg:flex-col lg:gap-1">
                    <ScoreFigure score={r.score} />
                    <span className="text-[13px] text-ink-3">
                      <DirectionMark direction={r.direction} short /> {r.direction === "bullish" ? "rise" : r.direction === "bearish" ? "fall" : "mixed"}
                    </span>
                  </span>
                )}
              </span>
              <span className="hidden lg:block">
                <TellStrip days={r.strip} width={132} height={32} />
              </span>
              <span className="col-span-2 flex items-center justify-between gap-4 lg:col-span-1 lg:block">
                <span className="text-[14.5px] text-ink-2 tnum">
                  ±{fmtPct(r.impliedMovePct, { sign: false, decimals: 0 })}
                  {live ? null : (
                    <>
                      <span className="mx-1.5 text-ink-3" aria-label="then">→</span>
                      <span className="font-semibold text-ink">{fmtPct(r.realizedMovePct)}</span>
                    </>
                  )}
                </span>
                <span className="lg:hidden">
                  {live && isRadar(r) ? <WindowMeter elapsed={r.daysElapsed} total={r.daysTotal} /> : <VerdictMark verdict={r.verdict} />}
                </span>
              </span>
              <span className="hidden lg:block">
                {live && isRadar(r) ? <WindowMeter elapsed={r.daysElapsed} total={r.daysTotal} /> : <VerdictMark verdict={r.verdict} />}
              </span>
            </Link>
          </li>
        ))}
      </ol>
    </div>
  );
}

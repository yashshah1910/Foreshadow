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

/** One row per case, shared by every list on the site. */
export function CaseList({
  rows,
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
      <div className="border-y hairline py-12 text-center">
        {empty ?? (
          <>
            <p className="text-[16px] text-ink">Nothing matches these filters.</p>
            <p className="mt-1 text-[14px] text-ink-3">Try a longer time range, or turn off a filter.</p>
          </>
        )}
      </div>
    );
  }
  const live = mode === "live";
  return (
    <div className="border-t hairline">
      <div className="hidden grid-cols-[minmax(0,1fr)_7rem_9.5rem_10rem_6.5rem] gap-6 border-b hairline py-2.5 text-[13px] text-ink-3 lg:grid">
        <span>Stock and news</span>
        <span>Unusual betting</span>
        <span>Betting, 10 days before</span>
        <span>{live ? "Expected move" : "Expected → actual"}</span>
        <span>{live ? "Days in" : "Bets were"}</span>
      </div>
      <ol>
        {rows.map((r) => (
          <li key={r.catalyst.id}>
            <Link
              href={`/event/${encodeURIComponent(r.catalyst.id)}`}
              className="group grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-6 gap-y-2 border-b hairline py-4 transition-colors duration-150 hover:bg-surface-2 lg:grid-cols-[minmax(0,1fr)_7rem_9.5rem_10rem_6.5rem] lg:-mx-3 lg:px-3"
            >
              <span className="min-w-0">
                <span className="flex items-baseline gap-2">
                  <span className="font-mono text-[15px] font-semibold text-ink">{r.catalyst.ticker}</span>
                  <span className="truncate text-[15px] text-ink group-hover:underline group-hover:underline-offset-2">{eventName(r)}</span>
                </span>
                <span className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[13px] text-ink-3">
                  <span className="tnum">{fmtDate(r.catalyst.eventDate, { weekday: live, year: showYear })}</span>
                  <span aria-hidden="true">·</span>
                  <KindTag kind={r.catalyst.kind} />
                  {r.company ? (
                    <>
                      <span aria-hidden="true" className="hidden sm:inline">·</span>
                      <span className="hidden truncate sm:inline">{r.company.name}</span>
                    </>
                  ) : null}
                </span>
              </span>
              <span className="text-right lg:text-left">
                {r.partialWindow && r.flags.footprintDaysUsed === 0 ? (
                  <span className="text-[13px] text-ink-3">not yet</span>
                ) : (
                  <span className="flex items-baseline gap-1.5 lg:flex-col lg:gap-0">
                    <ScoreFigure score={r.score} />
                    <span className="text-[12.5px] text-ink-3"><DirectionMark direction={r.direction} short /> {r.direction === "bullish" ? "rise" : r.direction === "bearish" ? "fall" : "mixed"}</span>
                  </span>
                )}
              </span>
              <span className="hidden lg:block">
                <TellStrip days={r.strip} width={132} height={30} />
              </span>
              <span className="col-span-2 flex items-center justify-between gap-4 text-[14px] lg:col-span-1 lg:block">
                <span className="font-mono text-[13.5px] text-ink-2 tnum">
                  ±{fmtPct(r.impliedMovePct, { sign: false, decimals: 0 })}
                  {live ? null : (
                    <>
                      <span className="mx-1.5 text-ink-3">→</span>
                      <span className="text-ink">{fmtPct(r.realizedMovePct)}</span>
                    </>
                  )}
                </span>
                <span className="lg:hidden">
                  {live && isRadar(r) ? <WindowMeter elapsed={r.daysElapsed} total={r.daysTotal} /> : <VerdictMark verdict={r.verdict} />}
                </span>
              </span>
              <span className="hidden text-[14px] lg:block">
                {live && isRadar(r) ? <WindowMeter elapsed={r.daysElapsed} total={r.daysTotal} /> : <VerdictMark verdict={r.verdict} />}
              </span>
            </Link>
          </li>
        ))}
      </ol>
    </div>
  );
}

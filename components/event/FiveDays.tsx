import { betsOf, type DailyMetrics } from "@foreshadow/core";
import { fmtDate } from "@/lib/format";
import { money } from "@/lib/plain";

/**
 * The counted days in words: what was bet on a rise and on a fall each day (calls and puts bought),
 * and how that compares with a normal day for this stock.
 */
export function FiveDays({ daily, windowDays, normalPerDay }: { daily: DailyMetrics[]; windowDays: string[]; normalPerDay: number | null }) {
  const byDate = new Map(daily.map((d) => [d.date, d]));
  const days = windowDays.map((date) => ({ date, m: byDate.get(date) ?? null }));
  const max = Math.max(1, ...days.map(({ m }) => (m ? betsOf(m).rise + betsOf(m).fall : 0)));
  if (days.length === 0) return null;
  return (
    <section aria-labelledby="five-h" className="mt-14">
      <h3 id="five-h" className="text-[19px] font-semibold text-ink">
        {days.length >= 5 ? "The five days that count, in words" : days.length === 1 ? "The day counted so far, in words" : `The ${days.length} days counted so far, in words`}
      </h3>
      <ol className="tray mt-4 grid gap-1.5 p-2">
        {days.map(({ date, m }) => {
          const call = m ? betsOf(m).rise : 0;
          const put = m ? betsOf(m).fall : 0;
          const total = call + put;
          const times = normalPerDay && normalPerDay > 0 && total > 0 ? total / normalPerDay : null;
          const lead = put > call ? [`${money(put)} on a fall`, call > 0 ? `${money(call)} on a rise` : null] : [`${money(call)} on a rise`, put > 0 ? `${money(put)} on a fall` : null];
          return (
            <li key={date} className="card grid grid-cols-[6.5rem_minmax(0,1fr)] items-center gap-4 px-4 py-3 sm:grid-cols-[8rem_9rem_minmax(0,1fr)]">
              <span className="text-[15px] font-medium text-ink">{fmtDate(date, { weekday: true })}</span>
              <span className="hidden h-2.5 overflow-hidden rounded-full bg-surface-2 sm:flex" aria-hidden="true">
                <span className="h-full bg-call" style={{ width: `${(call / max) * 100}%` }} />
                <span className="h-full bg-put" style={{ width: `${(put / max) * 100}%` }} />
              </span>
              <span className="min-w-0 text-[15px] text-ink-2">
                {total > 0 ? (
                  <>
                    {lead.filter(Boolean).join(", ")}
                    {times !== null ? (
                      <span className="font-semibold text-ink">
                        {times >= 1.5 ? `, ${times >= 10 ? Math.round(times) : times.toFixed(1)}× a normal day` : ", about a normal day"}
                      </span>
                    ) : null}
                  </>
                ) : m ? (
                  "No large bets flagged."
                ) : (
                  "Still to come."
                )}
              </span>
            </li>
          );
        })}
      </ol>
      {normalPerDay ? (
        <p className="mt-3 px-1 text-[14px] text-ink-3">
          A normal day for this stock, over the 60 days before, saw about {money(normalPerDay)} in large options bets.
        </p>
      ) : null}
    </section>
  );
}

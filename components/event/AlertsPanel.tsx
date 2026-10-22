import type { FlowAlert } from "@foreshadow/core";
import { fmtDateTimeEt, fmtExpiry, fmtInt, fmtMoney, fmtStrike } from "@/lib/format";
import { money } from "@/lib/plain";

/** The individual trades behind the score, biggest first, checkable on Unusual Whales. */
export function AlertsPanel({ alerts, ticker, limit = 25 }: { alerts: FlowAlert[]; ticker: string; limit?: number }) {
  const rows = [...alerts].sort((a, b) => b.premium - a.premium).slice(0, limit);
  const total = alerts.reduce((s, a) => s + a.premium, 0);
  return (
    <section aria-labelledby="alerts-h">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="alerts-h" className="display text-[28px] text-ink">The trades behind it</h2>
        <a href={`https://unusualwhales.com/stock/${ticker}`} target="_blank" rel="noreferrer" className="link text-[15px]">
          Check them on Unusual Whales ↗
        </a>
      </div>
      <p className="mt-2 max-w-[640px] text-[16px] leading-relaxed text-ink-2">
        {alerts.length === 0
          ? "No large options trades were flagged in these five days."
          : `${alerts.length} large options trades were flagged in these five days, worth ${money(total)} in total. A call pays off if the stock rises above its price; a put pays off if it falls below.`}
      </p>
      {rows.length > 0 ? (
        <table className="mt-6 w-full border-separate border-spacing-y-1 text-[15px]">
          <thead>
            <tr className="text-left text-[13px] font-medium text-ink-3">
              <th className="px-3 pb-1 font-medium">Bet</th>
              <th className="px-3 pb-1 font-medium">Strike, expiry</th>
              <th className="hidden px-3 pb-1 font-medium sm:table-cell">When</th>
              <th className="px-3 pb-1 text-right font-medium">Amount</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((a) => (
              <tr key={a.id} className="align-top odd:bg-surface-2 [&>td:first-child]:rounded-l-xl [&>td:last-child]:rounded-r-xl">
                <td className="px-3 py-3">
                  <span className={`inline-flex items-center gap-1 font-semibold ${a.type === "call" ? "text-call" : "text-put"}`}>
                    <span aria-hidden="true">{a.type === "call" ? "↑" : "↓"}</span>
                    {a.type === "call" ? "Call" : "Put"}
                  </span>
                </td>
                <td className="px-3 py-3 text-ink tnum">
                  {fmtStrike(a.strike)}, {fmtExpiry(a.expiry)}
                  <span className="block text-[13px] text-ink-3 sm:hidden">{fmtDateTimeEt(a.executedAt)}</span>
                </td>
                <td className="hidden px-3 py-3 text-ink-2 tnum sm:table-cell">
                  {fmtDateTimeEt(a.executedAt)}
                  <span className="block text-[13px] text-ink-3">
                    {fmtInt(a.size)} contracts{a.isSweep ? ", bought fast across exchanges" : ""}
                  </span>
                </td>
                <td className="px-3 py-3 text-right font-semibold text-ink tnum">{fmtMoney(a.premium)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
      {alerts.length > rows.length ? <p className="mt-3 px-3 text-[14px] text-ink-3">Showing the {rows.length} largest of {alerts.length}.</p> : null}
    </section>
  );
}

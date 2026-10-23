import type { SampleTrade, TradeTotals } from "@/lib/data";
import { fmtDate, fmtExpiry, fmtMoney, fmtStrike } from "@/lib/format";
import { money } from "@/lib/plain";

const SIDE_WORD = { ask: "bought", bid: "sold", mid: "between prices" } as const;

/** A few of the biggest trades behind the score, as examples, checkable on Unusual Whales. */
export function AlertsPanel({ trades, ticker, stats }: { trades: SampleTrade[]; ticker: string; stats: TradeTotals }) {
  const { count, premium: total, bought } = stats;
  return (
    <section aria-labelledby="alerts-h">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="alerts-h" className="display text-[28px] text-ink">The trades behind it</h2>
        <a href={`https://unusualwhales.com/stock/${ticker}`} target="_blank" rel="noreferrer" className="link text-[15px]">
          Check them on Unusual Whales ↗
        </a>
      </div>
      <p className="mt-2 max-w-[640px] text-[16px] leading-relaxed text-ink-2">
        {count === 0
          ? "No large options trades were flagged in these five days."
          : `${count.toLocaleString("en-US")} large options ${count === 1 ? "trade was" : "trades were"} flagged in these five days, worth ${money(total)} in total${
              bought !== undefined && total > 0 ? `. ${money(bought)} of it was bought at the asking price; those are the bets. The rest was sold or traded between the two prices` : ""
            }. A call pays off if the stock rises above its price; a put pays off if it falls below.`}
      </p>
      {trades.length > 0 ? (
        <table className="mt-6 w-full border-separate border-spacing-y-1 text-[15px]">
          <thead>
            <tr className="text-left text-[13px] font-medium text-ink-3">
              <th className="px-3 pb-1 font-medium">Trade</th>
              <th className="px-3 pb-1 font-medium">Strike, expiry</th>
              <th className="hidden px-3 pb-1 font-medium sm:table-cell">Day</th>
              <th className="px-3 pb-1 text-right font-medium">Amount</th>
            </tr>
          </thead>
          <tbody>
            {trades.map((a, i) => (
              <tr key={i} className="align-top odd:bg-surface-2 [&>td:first-child]:rounded-l-xl [&>td:last-child]:rounded-r-xl">
                <td className="px-3 py-3">
                  <span className={`inline-flex items-center gap-1 font-semibold ${a.type === "call" ? "text-call-ink" : "text-put-ink"}`}>
                    <span aria-hidden="true">{a.type === "call" ? "↑" : "↓"}</span>
                    {a.type === "call" ? "Call" : "Put"}
                  </span>
                  {a.side ? <span className="block text-[13px] text-ink-3">{SIDE_WORD[a.side]}</span> : null}
                </td>
                <td className="px-3 py-3 text-ink tnum">
                  {fmtStrike(a.strike)}, {fmtExpiry(a.expiry)}
                  <span className="block text-[13px] text-ink-3 sm:hidden">{fmtDate(a.tradeDate, { weekday: true })}</span>
                </td>
                <td className="hidden px-3 py-3 text-ink-2 tnum sm:table-cell">
                  {fmtDate(a.tradeDate, { weekday: true })}
                  {a.isSweep ? <span className="block text-[13px] text-ink-3">Filled fast across exchanges</span> : null}
                </td>
                <td className="px-3 py-3 text-right font-semibold text-ink tnum">{fmtMoney(a.premium)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
      {trades.length > 0 ? (
        <p className="mt-3 max-w-[640px] px-3 text-[14px] leading-relaxed text-ink-3">
          {count > trades.length
            ? `These are the ${trades.length} largest of ${count.toLocaleString("en-US")}, a sample from Unusual Whales data. The full list lives on Unusual Whales.`
            : "These trades are a sample from Unusual Whales data. The full details live on Unusual Whales."}
        </p>
      ) : null}
    </section>
  );
}

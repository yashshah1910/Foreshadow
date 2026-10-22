import type { FlowAlert } from "@foreshadow/core";
import { fmtDateTimeEt, fmtExpiry, fmtInt, fmtMoney, fmtStrike } from "@/lib/format";
import { money } from "@/lib/plain";

/** The individual trades behind the score, biggest first, checkable on Unusual Whales. */
export function AlertsPanel({ alerts, ticker, limit = 25 }: { alerts: FlowAlert[]; ticker: string; limit?: number }) {
  const rows = [...alerts].sort((a, b) => b.premium - a.premium).slice(0, limit);
  const total = alerts.reduce((s, a) => s + a.premium, 0);
  return (
    <section aria-labelledby="alerts-h" className="border-t hairline pt-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="alerts-h" className="display text-[24px] text-ink">The trades behind it</h2>
        <a href={`https://unusualwhales.com/stock/${ticker}`} target="_blank" rel="noreferrer" className="text-[14px] text-ink-2 underline underline-offset-2 hover:text-ink">
          Check them on Unusual Whales ↗
        </a>
      </div>
      <p className="mt-2 text-[15px] leading-relaxed text-ink-2">
        {alerts.length === 0
          ? "No large options trades were flagged in these five days."
          : `${alerts.length} large options trades were flagged in these five days, worth ${money(total)} in total. A call pays off if the stock rises above its price; a put pays off if it falls below.`}
      </p>
      {rows.length > 0 ? (
        <table className="mt-5 w-full text-[14px]">
          <thead>
            <tr className="border-b hairline text-left text-[13px] text-ink-3">
              <th className="pb-2 font-normal">Bet</th>
              <th className="pb-2 font-normal">Price · expires</th>
              <th className="hidden pb-2 font-normal sm:table-cell">When</th>
              <th className="pb-2 text-right font-normal">Amount</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((a) => (
              <tr key={a.id} className="border-b hairline align-top">
                <td className="py-2.5 pr-3">
                  <span className={a.type === "call" ? "text-call" : "text-put"}>{a.type === "call" ? "↑ Call" : "↓ Put"}</span>
                </td>
                <td className="py-2.5 pr-3 font-mono text-[13.5px] text-ink tnum">
                  {fmtStrike(a.strike)} · {fmtExpiry(a.expiry)}
                  <span className="block font-sans text-[12.5px] text-ink-3 sm:hidden">{fmtDateTimeEt(a.executedAt)}</span>
                </td>
                <td className="hidden py-2.5 pr-3 text-ink-2 tnum sm:table-cell">
                  {fmtDateTimeEt(a.executedAt)}
                  <span className="block text-[12.5px] text-ink-3">{fmtInt(a.size)} contracts{a.isSweep ? " · bought fast across exchanges" : ""}</span>
                </td>
                <td className="py-2.5 text-right font-mono text-ink tnum">{fmtMoney(a.premium)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
      {alerts.length > rows.length ? <p className="mt-3 text-[13px] text-ink-3">Showing the {rows.length} largest of {alerts.length}.</p> : null}
    </section>
  );
}

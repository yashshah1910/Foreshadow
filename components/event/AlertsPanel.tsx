import type { FlowAlert } from "@foreshadow/core";
import { fmtDateTimeEt, fmtExpiry, fmtInt, fmtMoney, fmtStrike } from "@/lib/format";

/** Exhibit B: every alert in the window, largest premium first, verifiable on UW. */
export function AlertsPanel({ alerts, ticker, limit = 40 }: { alerts: FlowAlert[]; ticker: string; limit?: number }) {
  const rows = [...alerts].sort((a, b) => b.premium - a.premium).slice(0, limit);
  const total = alerts.reduce((s, a) => s + a.premium, 0);
  const puts = alerts.filter((a) => a.type === "put").reduce((s, a) => s + a.premium, 0);
  const sweeps = alerts.filter((a) => a.isSweep).length;
  return (
    <section aria-labelledby="alerts-h" className="sheet flex flex-col">
      <header className="border-b hairline px-5 py-4">
        <div className="flex items-baseline justify-between gap-3">
          <div>
            <p className="label mb-1">Exhibit B</p>
            <h2 id="alerts-h" className="display text-[20px]">The receipts</h2>
          </div>
          <a
            href={`https://unusualwhales.com/stock/${ticker}`}
            target="_blank"
            rel="noreferrer"
            className="pressable text-[12.5px] font-medium text-ink underline decoration-line-strong underline-offset-4 hover:decoration-ink"
          >
            Verify on UW ↗
          </a>
        </div>
        <dl className="mt-3 grid grid-cols-3 gap-3 text-[12px]">
          <div>
            <dt className="text-ink-3">Alerts</dt>
            <dd className="font-mono text-[14px] text-ink tnum">{alerts.length}</dd>
          </div>
          <div>
            <dt className="text-ink-3">Premium</dt>
            <dd className="font-mono text-[14px] text-ink tnum">{fmtMoney(total)}</dd>
          </div>
          <div>
            <dt className="text-ink-3">Puts · sweeps</dt>
            <dd className="font-mono text-[14px] text-ink tnum">{total ? Math.round((puts / total) * 100) : 0}% · {sweeps}</dd>
          </div>
        </dl>
      </header>
      {rows.length === 0 ? (
        <p className="px-5 py-10 text-center text-[13px] text-ink-3">No flow alerts in this window.</p>
      ) : (
        <ol className="max-h-[560px] overflow-y-auto">
          {rows.map((a) => (
            <li key={a.id} className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-x-3 border-b hairline px-5 py-3 last:border-b-0">
              <span className="mt-[3px] flex items-center gap-1.5 font-mono text-[11px] font-semibold text-ink">
                <span className={`h-2.5 w-2.5 rounded-[2px] ${a.type === "call" ? "bg-call" : "bg-put"}`} aria-hidden="true" />
                {a.type === "call" ? "CALL" : "PUT"}
              </span>
              <span className="min-w-0">
                <span className="flex flex-wrap items-baseline gap-x-2 font-mono text-[13px] text-ink">
                  <span className="font-semibold">{fmtStrike(a.strike)}</span>
                  <span className="text-ink-2">{fmtExpiry(a.expiry)}</span>
                  {a.isSweep ? <span className="rounded-[3px] border border-line-strong px-1 text-[10px] uppercase tracking-wider text-ink-2">sweep</span> : null}
                </span>
                <span className="mt-1 block text-[11.5px] leading-snug text-ink-3 tnum">
                  {fmtDateTimeEt(a.executedAt)} · {fmtInt(a.size)} contracts · {a.side === "ask" ? "ask side" : a.side === "bid" ? "bid side" : "mid"}
                </span>
              </span>
              <span className="font-mono text-[13.5px] font-semibold text-ink tnum">{fmtMoney(a.premium)}</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

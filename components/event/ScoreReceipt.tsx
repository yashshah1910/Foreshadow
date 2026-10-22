import type { SignalBreakdown as Signal } from "@foreshadow/core";
import { fmtInt, fmtMoney, fmtNum } from "@/lib/format";

const DETAIL: Record<string, (s: Signal) => string> = {
  flowIntensity: (s) =>
    `${fmtMoney(s.footprintValue)}/day vs ${fmtMoney(s.baselineMean)} baseline · ${fmtNum(s.detail.footprintAlertsPerDay, 1)} vs ${fmtNum(s.detail.baselineAlertsPerDay, 1)} alerts/day · ${Math.round(s.detail.sweepShareFootprint * 100)}% sweeps`,
  directionalPremium: (s) =>
    `net ask-side ${s.footprintValue >= 0 ? "+" : "−"}${fmtMoney(Math.abs(s.footprintValue))}/day vs ${s.baselineMean >= 0 ? "+" : "−"}${fmtMoney(Math.abs(s.baselineMean))} · calls ${fmtMoney(s.detail.callPremium)} · puts ${fmtMoney(s.detail.putPremium)}`,
  openInterest: (s) =>
    `${fmtInt(s.footprintValue)} contracts/day vs ${fmtInt(s.baselineMean)} · calls ${s.detail.callOiChange >= 0 ? "+" : ""}${fmtInt(s.detail.callOiChange)} · puts ${s.detail.putOiChange >= 0 ? "+" : ""}${fmtInt(s.detail.putOiChange)}`,
  volumeUnusualness: (s) => `${Math.round(s.footprintValue)}th percentile on average · peak ${Math.round(s.detail.maxPercentile)} · baseline ${Math.round(s.baselineMean)}`,
  skewShift: (s) =>
    `put−call IV ${(s.detail.skewStart * 100).toFixed(1)} → ${(s.detail.skewEnd * 100).toFixed(1)} pts · typical 5-day move ±${(s.baselineSd * 100).toFixed(1)}`,
  darkPool: (s) => `${fmtMoney(s.footprintValue)}/day in prints ≥ $1M vs ${fmtMoney(s.baselineMean)} · ${s.detail.printsOver1M} prints`,
};

/** The arithmetic, written out like a receipt so anyone can re-add it. */
export function ScoreReceipt({ signals, score }: { signals: Signal[]; score: number }) {
  return (
    <section aria-labelledby="receipt-h" className="sheet">
      <header className="flex flex-wrap items-baseline justify-between gap-2 border-b hairline px-5 py-4">
        <h2 id="receipt-h" className="display text-[20px]">How the score adds up</h2>
        <code className="font-mono text-[11.5px] text-ink-3">Σ weight × min(max(z, 0) / 4, 1) × 100</code>
      </header>
      <ol>
        {signals.map((s) => {
          const fill = Math.round(s.clipped * 100);
          return (
            <li key={s.key} className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-6 gap-y-1.5 border-b hairline px-5 py-3.5">
              <div className="min-w-0">
                <p className="flex items-baseline gap-2 text-[13.5px] text-ink">
                  {s.label}
                  <span className="font-mono text-[11px] text-ink-3">z {s.z.toFixed(2)}</span>
                </p>
                <p className="mt-0.5 text-[12.5px] leading-snug text-ink-2 tnum">{DETAIL[s.key]?.(s)}</p>
              </div>
              <p className="text-right font-mono tnum">
                <span className="text-[15px] font-semibold text-ink">+{s.contribution.toFixed(1)}</span>
                <span className="text-[12px] text-ink-3"> / {Math.round(s.weight * 100)}</span>
              </p>
              <span className="col-span-2 mt-0.5 block h-[5px] overflow-hidden rounded-full bg-surface-3" aria-hidden="true">
                <span className={`block h-full rounded-full ${fill >= 50 ? "bg-ink" : "bg-ink-3"}`} style={{ width: `${Math.max(fill, 1.5)}%` }} />
              </span>
            </li>
          );
        })}
      </ol>
      <footer className="flex items-baseline justify-between px-5 py-4">
        <span className="label text-ink">Total</span>
        <span className="font-mono text-[18px] font-semibold text-ink tnum">{score.toFixed(1)}</span>
      </footer>
    </section>
  );
}

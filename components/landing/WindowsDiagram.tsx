/**
 * The time axis every score is built on. The baseline is drawn compressed
 * (with a break mark) so the five-session footprint stays legible.
 */
export function WindowsDiagram() {
  return (
    <div className="sheet p-5 sm:p-7">
      <div className="grid grid-cols-[minmax(0,5fr)_14px_minmax(0,4fr)_2px_minmax(0,2.4fr)] items-end gap-x-2">
        <Segment label="Baseline" sub="60 sessions · T-65 → T-6" tone="base" />
        <span className="mb-[9px] text-center font-mono text-[13px] text-ink-3" aria-hidden="true">≈</span>
        <Segment label="Footprint" sub="5 sessions · T-5 → T-1" tone="hl" />
        <span className="mb-0 h-12 w-[2px] rounded bg-ink" aria-hidden="true" />
        <Segment label="Verdict" sub="T, or T+1 after hours" tone="out" />
      </div>
      <div className="mt-6 grid gap-6 text-[13.5px] leading-relaxed text-ink-2 md:grid-cols-3">
        <p>
          <span className="font-medium text-ink">Every ticker is its own control.</span> Each signal is a z-score of the
          footprint against that ticker&apos;s 60-session baseline, so a sleepy biotech and a mega-cap are comparable.
        </p>
        <p>
          <span className="font-medium text-ink">Six signals, one number.</span> Flow-alert intensity, directional
          premium, new open interest, volume, skew and dark pool, each clipped at z = 4, weighted and summed to 0–100.
        </p>
        <p>
          <span className="font-medium text-ink">Then the market answers.</span> A footprint matches when the move is at
          least the implied move and goes the way the positioning pointed. Otherwise it missed, and that shows too.
        </p>
      </div>
    </div>
  );
}

function Segment({ label, sub, tone }: { label: string; sub: string; tone: "base" | "hl" | "out" }) {
  const bar =
    tone === "hl" ? "bg-hl" : tone === "base" ? "bg-surface-3" : "border border-line-strong bg-transparent";
  return (
    <div className="min-w-0">
      <p className="text-[13px] font-medium text-ink">{label}</p>
      <p className="mb-2 truncate font-mono text-[11px] text-ink-3">{sub}</p>
      <div className={`h-[18px] rounded-[3px] ${bar} ${tone === "hl" ? "-skew-x-6" : ""}`} />
    </div>
  );
}

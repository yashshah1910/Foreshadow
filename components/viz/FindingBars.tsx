import type { ScorecardBand } from "@/lib/data";

/** Percent right for unusual (40+) and ordinary (under 20) betting, for a shared bar scale. */
export function findingRates(bands: ScorecardBand[]): number[] {
  const unusual = bands.filter((b) => b.min >= 40);
  const u = unusual.reduce((n, b) => n + b.cases, 0);
  const o = bands.find((b) => b.min === 0);
  return [u ? (unusual.reduce((n, b) => n + b.right, 0) / u) * 100 : 0, o?.cases ? (o.right / o.cases) * 100 : 0];
}

/**
 * Two bars under a scorecard finding: how often unusual betting (40+) was
 * right, against ordinary betting (under 20). Pass the same `scaleMax` to
 * every card on a page so bars compare across kinds of news too.
 */
export function FindingBars({ bands, scaleMax }: { bands: ScorecardBand[]; scaleMax?: number }) {
  const unusual = bands.filter((b) => b.min >= 40);
  const u = { cases: unusual.reduce((n, b) => n + b.cases, 0), right: unusual.reduce((n, b) => n + b.right, 0) };
  const o = bands.find((b) => b.min === 0);
  if (!o || o.cases === 0 || u.cases === 0) return null;
  const rows = [
    { label: "Unusual betting", pct: (u.right / u.cases) * 100, cases: u.cases, strong: true },
    { label: "Ordinary betting", pct: (o.right / o.cases) * 100, cases: o.cases, strong: false },
  ];
  const max = scaleMax ?? Math.max(10, ...rows.map((r) => r.pct));
  return (
    <dl className="mt-4 grid gap-2">
      {rows.map((r) => (
        <div key={r.label} className="grid grid-cols-[8.5rem_minmax(0,1fr)_3rem] items-center gap-3 text-[13.5px]">
          <dt className="text-ink-2">{r.label}</dt>
          <dd className="h-2.5 rounded-full bg-surface" aria-hidden="true">
            <span className={`block h-full rounded-full ${r.strong ? "bg-ink" : "bg-ink-3"}`} style={{ width: `${Math.max(2, (r.pct / max) * 100)}%` }} />
          </dd>
          <dd className="text-right font-semibold text-ink tnum">
            {r.pct.toFixed(0)}%<span className="sr-only"> right, of {r.cases} cases</span>
          </dd>
        </div>
      ))}
    </dl>
  );
}

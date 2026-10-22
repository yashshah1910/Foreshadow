import { fmtPct } from "@/lib/format";

/**
 * Implied vs realized move on one axis centred at zero: the shaded band is
 * ±implied, the bar is the realized close-to-close move.
 */
export function MoveGauge({ implied, realized, width = 104, height = 14 }: { implied: number | null; realized: number | null; width?: number; height?: number }) {
  const c = width / 2;
  const span = Math.max(Math.abs(realized ?? 0), implied ?? 0, 2) * 1.15;
  const s = (c - 2) / span;
  const band = (implied ?? 0) * s;
  const r = (realized ?? 0) * s;
  const label =
    realized === null
      ? `Implied move ${fmtPct(implied, { sign: false })}; realized move pending`
      : `Implied move ±${fmtPct(implied, { sign: false })}; realized ${fmtPct(realized)}`;
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={label} className="block">
      <title>{label}</title>
      <rect x={0} y={height / 2 - 0.5} width={width} height={1} className="fill-line-strong" />
      {implied ? <rect x={c - band} y={1} width={band * 2} height={height - 2} rx={2} className="fill-surface-3" /> : null}
      {realized !== null ? (
        <rect
          x={r >= 0 ? c : c + r}
          y={height / 2 - 3}
          width={Math.max(1.5, Math.abs(r))}
          height={6}
          rx={2}
          className={realized >= 0 ? "fill-call" : "fill-put"}
        />
      ) : null}
      <rect x={c - 0.75} y={0} width={1.5} height={height} className="fill-ink" />
    </svg>
  );
}

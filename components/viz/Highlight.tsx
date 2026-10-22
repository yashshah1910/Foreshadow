import type { CSSProperties, ReactNode } from "react";

/** A highlighter swipe behind inline text. `draw` animates it in once. */
export function Highlight({ children, draw = false, delay = 280, className = "" }: { children: ReactNode; draw?: boolean; delay?: number; className?: string }) {
  return (
    <span className={`hl ${draw ? "hl-draw" : ""} ${className}`} style={draw ? ({ "--hl-delay": `${delay}ms` } as CSSProperties) : undefined}>
      {children}
    </span>
  );
}

/** A highlighter-shaped band for SVG: slanted ends, slightly uneven edges. */
export function bandPath(x0: number, x1: number, y0: number, y1: number): string {
  const w = x1 - x0;
  const h = y1 - y0;
  const s = Math.min(6, w * 0.08);
  const r = (n: number) => n.toFixed(1);
  return [
    `M${r(x0 + s)},${r(y0 + h * 0.01)}`,
    `Q${r(x0 + w * 0.5)},${r(y0 - h * 0.006)} ${r(x1)},${r(y0 + h * 0.004)}`,
    `L${r(x1 - s * 0.6)},${r(y1)}`,
    `Q${r(x0 + w * 0.45)},${r(y1 + h * 0.008)} ${r(x0)},${r(y1 - h * 0.006)}`,
    "Z",
  ].join(" ");
}

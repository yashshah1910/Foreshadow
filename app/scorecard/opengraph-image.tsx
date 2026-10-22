import { ImageResponse } from "next/og";
import { getScorecard } from "@/lib/data";
import { kindsLiftFirst, scorecardFinding } from "@/lib/plain";
import { KIND_LABELS } from "@/lib/format";
import { findingRates } from "@/components/viz/FindingBars";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "Foreshadow scorecard: how often unusual options betting was right";

const TRAY = "#f2f4f7";
const INK = "#131722";
const INK2 = "#464e5e";
const INK3 = "#626a7b";
const HL = "#ffe14a";

export default async function Image() {
  const card = await getScorecard();
  const kinds = kindsLiftFirst(card.kinds)
    .slice(0, 2)
    .map((k) => ({ k, finding: scorecardFinding(k.kind, k.bands), rates: findingRates(k.bands) }));
  const scaleMax = Math.max(10, ...kinds.flatMap((x) => x.rates));
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", background: TRAY, padding: 40, fontFamily: "sans-serif" }}>
        <div style={{ display: "flex", flexDirection: "column", flex: 1, background: "#ffffff", borderRadius: 28, padding: "40px 52px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ display: "flex", width: 26, height: 22, background: HL, transform: "skewX(-8deg)", borderRadius: 5 }} />
            <div style={{ display: "flex", width: 5, height: 32, background: INK, borderRadius: 3 }} />
            <div style={{ display: "flex", fontSize: 30, color: INK, marginLeft: 6 }}>Foreshadow scorecard</div>
          </div>
          <div style={{ display: "flex", fontSize: 40, color: INK, marginTop: 20, letterSpacing: -1, lineHeight: 1.12 }}>
            Does unusual betting know something?
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 22 }}>
            {kinds.map(({ k, finding, rates }, i) => (
              <div key={k.kind} style={{ display: "flex", gap: 18, alignItems: "flex-start", background: TRAY, borderRadius: 18, padding: "16px 22px" }}>
                <div style={{ display: "flex", fontSize: 20, color: INK3, width: 104, flexShrink: 0, marginTop: 3 }}>{KIND_LABELS[k.kind] ?? k.kind}</div>
                <div style={{ display: "flex", flexDirection: "column", flex: 1, gap: 8 }}>
                  <div style={{ display: "flex", fontSize: i === 0 ? 24 : 20, color: i === 0 ? INK : INK2, lineHeight: 1.3 }}>{finding}</div>
                  {[
                    ["Unusual", rates[0], INK],
                    ["Ordinary", rates[1], INK3],
                  ].map(([label, pct, color]) => (
                    <div key={String(label)} style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 17, color: INK3 }}>
                      <div style={{ display: "flex", width: 82 }}>{label}</div>
                      <div style={{ display: "flex", flex: 1, height: 12, background: "#ffffff", borderRadius: 6 }}>
                        <div style={{ display: "flex", width: `${Math.max(2, (Number(pct) / scaleMax) * 100)}%`, height: 12, background: String(color), borderRadius: 6 }} />
                      </div>
                      <div style={{ display: "flex", width: 48, justifyContent: "flex-end", color: INK }}>{`${Number(pct).toFixed(0)}%`}</div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <div style={{ display: "flex", marginTop: "auto", paddingTop: 16, fontSize: 19, color: INK3 }}>
            {`${card.cases.toLocaleString("en-US")} finished cases, nothing picked by hand`}
          </div>
        </div>
      </div>
    ),
    size,
  );
}

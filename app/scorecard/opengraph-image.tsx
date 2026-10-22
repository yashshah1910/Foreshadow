import { ImageResponse } from "next/og";
import { getScorecard } from "@/lib/data";
import { kindsLiftFirst, scorecardFinding } from "@/lib/plain";
import { KIND_LABELS } from "@/lib/format";

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
    .map((k) => ({ k, finding: scorecardFinding(k.kind, k.bands) }));
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", background: TRAY, padding: 40, fontFamily: "sans-serif" }}>
        <div style={{ display: "flex", flexDirection: "column", flex: 1, background: "#ffffff", borderRadius: 28, padding: "40px 52px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ display: "flex", width: 26, height: 22, background: HL, transform: "skewX(-8deg)", borderRadius: 5 }} />
            <div style={{ display: "flex", width: 5, height: 32, background: INK, borderRadius: 3 }} />
            <div style={{ display: "flex", fontSize: 30, color: INK, marginLeft: 6 }}>Foreshadow scorecard</div>
          </div>
          <div style={{ display: "flex", fontSize: 44, color: INK, marginTop: 24, letterSpacing: -1, lineHeight: 1.12 }}>
            Does unusual betting before the news know something?
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 26 }}>
            {kinds.map(({ k, finding }, i) => (
              <div key={k.kind} style={{ display: "flex", gap: 18, alignItems: "flex-start", background: TRAY, borderRadius: 18, padding: "16px 22px" }}>
                <div style={{ display: "flex", fontSize: 20, color: INK3, width: 104, flexShrink: 0, marginTop: 3 }}>{KIND_LABELS[k.kind] ?? k.kind}</div>
                <div style={{ display: "flex", fontSize: i === 0 ? 25 : 21, color: i === 0 ? INK : INK2, lineHeight: 1.3 }}>{finding}</div>
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

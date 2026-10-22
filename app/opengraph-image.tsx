import { ImageResponse } from "next/og";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "Foreshadow: spot the big bets placed days before the news";

const TRAY = "#f2f4f7";
const INK = "#131722";
const INK2 = "#464e5e";
const CALL = "#0e8a7a";
const PUT = "#d23a52";
const HL = "#ffe14a";

// Ten days of illustrative bets: quiet, then a burst in the last five.
const BARS: [number, number][] = [
  [10, 6], [14, 5], [8, 9], [12, 4], [9, 7],
  [30, 8], [52, 10], [44, 6], [70, 12], [88, 9],
];

/** The site-wide share card. */
export default function Image() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", background: TRAY, padding: 40, fontFamily: "sans-serif" }}>
        <div style={{ display: "flex", flex: 1, background: "#ffffff", borderRadius: 28, padding: "56px 64px", gap: 48 }}>
          <div style={{ display: "flex", flexDirection: "column", flex: 1, justifyContent: "space-between" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ display: "flex", width: 30, height: 26, background: HL, transform: "skewX(-8deg)", borderRadius: 6 }} />
              <div style={{ display: "flex", width: 6, height: 38, background: INK, borderRadius: 3 }} />
              <div style={{ display: "flex", fontSize: 36, fontWeight: 700, color: INK, marginLeft: 6 }}>Foreshadow</div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
              <div style={{ display: "flex", fontSize: 68, fontWeight: 800, color: INK, lineHeight: 1.04, letterSpacing: -2 }}>
                Spot the big bets placed days before the news.
              </div>
              <div style={{ display: "flex", fontSize: 28, color: INK2, lineHeight: 1.35 }}>
                Options betting before FDA decisions and earnings, scored 0 to 100, then checked against what the stock did.
              </div>
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", width: 330 }}>
            <div style={{ display: "flex", position: "relative", height: 300, alignItems: "center", gap: 8 }}>
              <div style={{ display: "flex", position: "absolute", left: 150, right: 22, top: 0, bottom: 0, background: HL, opacity: 0.6, borderRadius: 14, transform: "skewX(-5deg)" }} />
              {BARS.map(([call, put], i) => (
                <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: "center", width: 22, opacity: i < 5 ? 0.35 : 1 }}>
                  <div style={{ display: "flex", height: 120, alignItems: "flex-end" }}>
                    <div style={{ display: "flex", width: 22, height: call * 1.3, background: CALL, borderRadius: 4 }} />
                  </div>
                  <div style={{ display: "flex", height: 120, alignItems: "flex-start", marginTop: 4 }}>
                    <div style={{ display: "flex", width: 22, height: put * 1.3, background: PUT, borderRadius: 4 }} />
                  </div>
                </div>
              ))}
              <div style={{ display: "flex", width: 6, height: 280, background: INK, borderRadius: 3, marginLeft: 6 }} />
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 20, color: INK2, marginTop: 14 }}>
              <span>normal days</span>
              <span>the 5 days before</span>
            </div>
          </div>
        </div>
      </div>
    ),
    size,
  );
}

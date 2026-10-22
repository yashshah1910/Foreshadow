import { ImageResponse } from "next/og";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "Guess the move: can you read the options betting before the news better than the bets themselves?";

const TRAY = "#f2f4f7";
const INK = "#131722";
const INK3 = "#626a7b";
const HL = "#ffe14a";
const CALL = "#0b7266";
const PUT = "#b8283f";

export default function Image() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", background: TRAY, padding: 40, fontFamily: "sans-serif" }}>
        <div style={{ display: "flex", flexDirection: "column", flex: 1, background: "#ffffff", borderRadius: 28, padding: "44px 56px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ display: "flex", width: 26, height: 22, background: HL, transform: "skewX(-8deg)", borderRadius: 5 }} />
            <div style={{ display: "flex", width: 5, height: 32, background: INK, borderRadius: 3 }} />
            <div style={{ display: "flex", fontSize: 30, color: INK, marginLeft: 6 }}>Foreshadow</div>
          </div>
          <div style={{ display: "flex", fontSize: 76, color: INK, marginTop: 36, letterSpacing: -2 }}>Guess the move</div>
          <div style={{ display: "flex", fontSize: 32, color: INK3, marginTop: 14, lineHeight: 1.3, maxWidth: 900 }}>
            Five real cases. See the betting before the news, call rise or fall, and find out if you beat the bets.
          </div>
          <div style={{ display: "flex", gap: 16, marginTop: "auto" }}>
            <div style={{ display: "flex", background: CALL, color: "#ffffff", fontSize: 30, borderRadius: 18, padding: "16px 34px" }}>↑ It rose</div>
            <div style={{ display: "flex", background: PUT, color: "#ffffff", fontSize: 30, borderRadius: 18, padding: "16px 34px" }}>↓ It fell</div>
          </div>
        </div>
      </div>
    ),
    size,
  );
}

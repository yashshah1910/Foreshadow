import { ImageResponse } from "next/og";
import { getLeaderboard } from "@/lib/data";
import { fmtDate, fmtPct } from "@/lib/format";
import { eventPhrase, OUTCOME_SHORT, outcomeOf } from "@/lib/plain";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "Foreshadow Past cases: the most unusual options betting before company news, and whether the bets were right";
export const revalidate = 1800;

const TRAY = "#f2f4f7";
const INK = "#131722";
const INK3 = "#626a7b";
const HL = "#ffe14a";
const CALL = "#0b7266";
const PUT = "#b8283f";

export default async function Image() {
  const items = (await getLeaderboard({ limit: 3 }).catch(() => [])).slice(0, 3);
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", background: TRAY, padding: 40, fontFamily: "sans-serif" }}>
        <div style={{ display: "flex", flexDirection: "column", flex: 1, background: "#ffffff", borderRadius: 28, padding: "40px 52px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ display: "flex", width: 26, height: 22, background: HL, transform: "skewX(-8deg)", borderRadius: 5 }} />
            <div style={{ display: "flex", width: 5, height: 32, background: INK, borderRadius: 3 }} />
            <div style={{ display: "flex", fontSize: 28, color: INK, marginLeft: 6 }}>Foreshadow</div>
          </div>
          <div style={{ display: "flex", fontSize: 58, color: INK, marginTop: 26, letterSpacing: -1.5 }}>Past cases</div>
          <div style={{ display: "flex", fontSize: 26, color: INK3, marginTop: 8 }}>The most unusual options betting before the news, and what happened next</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: "auto" }}>
            {items.length === 0 ? (
              <div style={{ display: "flex", fontSize: 26, color: INK3 }}>No finished cases yet.</div>
            ) : (
              items.map((r) => (
                <div key={r.catalyst.id} style={{ display: "flex", alignItems: "center", gap: 20, background: TRAY, borderRadius: 16, padding: "12px 20px" }}>
                  <div style={{ display: "flex", width: 72, justifyContent: "center", fontSize: 40, fontWeight: 800, color: INK, background: r.score >= 70 ? HL : "transparent", borderRadius: 8 }}>
                    {Math.round(r.score)}
                  </div>
                  <div style={{ display: "flex", fontSize: 30, fontWeight: 700, color: INK, width: 110 }}>{r.catalyst.ticker}</div>
                  <div style={{ display: "flex", fontSize: 24, color: INK3, flex: 1 }}>{`${eventPhrase(r)}, ${fmtDate(r.catalyst.eventDate)}`}</div>
                  <div style={{ display: "flex", fontSize: 24, color: outcomeOf(r) === "right" ? CALL : outcomeOf(r) === "wrongWay" ? PUT : INK3 }}>
                    {`${(r.realizedMovePct ?? 0) >= 0 ? "↑" : "↓"} ${fmtPct(Math.abs(r.realizedMovePct ?? 0), { sign: false })} · ${OUTCOME_SHORT[outcomeOf(r)]}`}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    ),
    size,
  );
}

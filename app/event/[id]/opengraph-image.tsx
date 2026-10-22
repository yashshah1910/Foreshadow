import { ImageResponse } from "next/og";
import { getEvent } from "@/lib/data";
import { fmtDate, fmtPct, KIND_LABELS } from "@/lib/format";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "Foreshadow case card";

const PAPER = "#eceef2";
const SHEET = "#fbfbfc";
const INK = "#121826";
const INK2 = "#4a5468";
const INK3 = "#7a8396";
const CALL = "#0e8a7a";
const PUT = "#d23a52";
const HL = "#ffe14a";

export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ev = await getEvent(decodeURIComponent(id));
  if (!ev) {
    return new ImageResponse(
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: PAPER, color: INK, fontSize: 56, fontWeight: 700 }}>
        Foreshadow
      </div>,
      size,
    );
  }
  const s = ev.summary;
  const days = s.strip;
  const max = Math.max(1, ...days.map((d) => Math.max(d.call, d.put)));
  const firstWin = days.findIndex((d) => d.inWindow);
  const strong = s.score >= 70;
  const dirText = s.direction === "bullish" ? "Bullish" : s.direction === "bearish" ? "Bearish" : "Mixed";
  const dirColor = s.direction === "bullish" ? CALL : s.direction === "bearish" ? PUT : INK3;
  const verdictText = s.verdict === "matched" ? "Matched" : s.verdict === "missed" ? "Missed" : s.verdict === "pending" ? "Pending" : "No data";
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", background: PAPER, padding: 40, fontFamily: "sans-serif" }}>
        <div style={{ display: "flex", flexDirection: "column", flex: 1, background: SHEET, borderRadius: 18, border: "1px solid rgba(18,24,38,0.1)", padding: "40px 48px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14, fontSize: 22, color: INK3 }}>
            <div style={{ display: "flex", width: 26, height: 18, background: HL, transform: "skewX(-8deg)", borderRadius: 3 }} />
            <span style={{ color: INK, fontWeight: 700 }}>Foreshadow</span>
            <span>{`${KIND_LABELS[s.catalyst.kind] ?? s.catalyst.kind}  ·  ${fmtDate(s.catalyst.eventDate, { year: true })}`}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginTop: 34 }}>
            <div style={{ display: "flex", flexDirection: "column", maxWidth: 720 }}>
              <div style={{ fontSize: 72, fontWeight: 800, color: INK, letterSpacing: -2, lineHeight: 1 }}>{s.catalyst.ticker}</div>
              <div style={{ fontSize: 40, fontWeight: 600, color: INK2, marginTop: 12, lineHeight: 1.1 }}>{s.catalyst.title}</div>
              <div style={{ display: "flex", gap: 28, marginTop: 26, fontSize: 26, color: INK2, alignItems: "center" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{ display: "flex", width: 14, height: 14, borderRadius: 3, background: dirColor }} />
                  <span>{dirText}</span>
                </div>
                <div style={{ display: "flex", padding: "4px 14px", borderRadius: 8, background: s.verdict === "matched" ? INK : "transparent", color: s.verdict === "matched" ? SHEET : INK2, border: s.verdict === "matched" ? "none" : `2px solid ${INK3}` }}>
                  {verdictText}
                </div>
                <span>{`±${fmtPct(s.impliedMovePct, { sign: false })} implied → ${s.verdict === "pending" ? "pending" : fmtPct(s.realizedMovePct)}`}</span>
              </div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
              <div style={{ display: "flex", position: "relative", padding: "0 12px" }}>
                {strong ? <div style={{ display: "flex", position: "absolute", left: 0, right: 0, top: 22, bottom: 8, background: HL, transform: "skewX(-7deg)", borderRadius: 10 }} /> : null}
                <span style={{ fontSize: 168, fontWeight: 800, color: INK, letterSpacing: -6, lineHeight: 1 }}>{s.score.toFixed(0)}</span>
              </div>
              <span style={{ fontSize: 24, color: INK2, marginTop: 4 }}>{strong ? "Someone knew" : s.score >= 40 ? "Notable" : "Quiet"}</span>
            </div>
          </div>
          <div style={{ display: "flex", position: "relative", alignItems: "center", gap: 10, marginTop: "auto", height: 120 }}>
            {firstWin >= 0 ? (
              <div style={{ display: "flex", position: "absolute", top: 0, bottom: 0, left: `${(firstWin / days.length) * 100}%`, right: 0, background: HL, opacity: 0.55, transform: "skewX(-6deg)", borderRadius: 8 }} />
            ) : null}
            {days.map((d) => (
              <div key={d.date} style={{ display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", flex: 1, height: 120, opacity: d.inWindow ? 1 : 0.35 }}>
                <div style={{ display: "flex", flexDirection: "column", justifyContent: "flex-end", width: "60%", height: 58 }}>
                  <div style={{ display: "flex", width: "100%", height: Math.max(2, (d.call / max) * 56), background: CALL, borderRadius: 3 }} />
                </div>
                <div style={{ display: "flex", width: "60%", height: 2, background: "rgba(18,24,38,0.2)" }} />
                <div style={{ display: "flex", flexDirection: "column", justifyContent: "flex-start", width: "60%", height: 58 }}>
                  <div style={{ display: "flex", width: "100%", height: Math.max(2, (d.put / max) * 56), background: PUT, borderRadius: 3 }} />
                </div>
              </div>
            ))}
            <div style={{ display: "flex", width: 4, height: 120, background: INK, borderRadius: 2 }} />
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 14, fontSize: 18, color: INK3 }}>
            <span>Flow-alert premium, 10 sessions before the event · calls up, puts down · highlighted: the footprint</span>
            <span>Not financial advice</span>
          </div>
        </div>
      </div>
    ),
    size,
  );
}

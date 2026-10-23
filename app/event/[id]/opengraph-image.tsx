import { ImageResponse } from "next/og";
import { getEvent, getScorecard } from "@/lib/data";
import { fmtDate, fmtPct, KIND_LABELS } from "@/lib/format";
import { eventName, outcomeOf, scoreWord, type Outcome } from "@/lib/plain";
import { topShare } from "@/lib/rank";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "Foreshadow case card";

const PAPER = "#f2f4f7";
const SHEET = "#ffffff";
const INK = "#131722";
const INK2 = "#4a5468";
const INK3 = "#626a7b";
const CALL = "#0e8a7a";
const PUT = "#d23a52";
const HL = "#ffe14a";

const OUTCOME_CARD: Record<Outcome, string> = {
  right: "Bets were right",
  rightWay: "Right way, smaller move",
  wrongWay: "Bets were wrong",
  noLean: "No clear side",
  pending: "Waiting for the news",
  none: "No result",
};

export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [ev, card] = await Promise.all([getEvent(decodeURIComponent(id)), getScorecard()]);
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
  const dirText = s.direction === "bullish" ? "Bets on a rise" : s.direction === "bearish" ? "Bets on a fall" : "Mixed bets";
  const dirColor = s.direction === "bullish" ? CALL : s.direction === "bearish" ? PUT : INK3;
  const verdictText = OUTCOME_CARD[outcomeOf(s)];
  const top = topShare(s.score, card.kinds.find((k) => k.kind === s.catalyst.kind)?.scores ?? []);
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", background: PAPER, padding: 40, fontFamily: "sans-serif" }}>
        <div style={{ display: "flex", flexDirection: "column", flex: 1, background: SHEET, borderRadius: 24, padding: "40px 48px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14, fontSize: 22, color: INK3 }}>
            <div style={{ display: "flex", width: 26, height: 18, background: HL, transform: "skewX(-8deg)", borderRadius: 3 }} />
            <span style={{ color: INK, fontWeight: 700 }}>Foreshadow</span>
            <span>{`${KIND_LABELS[s.catalyst.kind] ?? s.catalyst.kind}  ·  ${fmtDate(s.catalyst.eventDate, { year: true })}`}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginTop: 34 }}>
            <div style={{ display: "flex", flexDirection: "column", maxWidth: 720 }}>
              <div style={{ fontSize: 72, fontWeight: 800, color: INK, letterSpacing: -2, lineHeight: 1 }}>{s.catalyst.ticker}</div>
              <div style={{ fontSize: 40, fontWeight: 600, color: INK2, marginTop: 12, lineHeight: 1.1 }}>{eventName(s)}</div>
              <div style={{ display: "flex", flexWrap: "wrap", columnGap: 20, rowGap: 12, marginTop: 24, fontSize: 24, color: INK2, alignItems: "center" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{ display: "flex", width: 14, height: 14, borderRadius: 3, background: dirColor }} />
                  <span>{dirText}</span>
                </div>
                <div style={{ display: "flex", flexShrink: 0, whiteSpace: "nowrap", padding: "4px 14px", borderRadius: 999, background: s.verdict === "matched" ? INK : PAPER, color: s.verdict === "matched" ? SHEET : INK2, border: "none" }}>
                  {verdictText}
                </div>
                <span style={{ whiteSpace: "nowrap" }}>
                  {s.verdict === "pending" ? `±${fmtPct(s.impliedMovePct, { sign: false })} expected` : `±${fmtPct(s.impliedMovePct, { sign: false })} expected, moved ${fmtPct(s.realizedMovePct)}`}
                </span>
              </div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
              <div style={{ display: "flex", position: "relative", padding: "0 12px" }}>
                {strong ? <div style={{ display: "flex", position: "absolute", left: 0, right: 0, top: 22, bottom: 8, background: HL, transform: "skewX(-7deg)", borderRadius: 10 }} /> : null}
                <span style={{ fontSize: 168, fontWeight: 800, color: INK, letterSpacing: -6, lineHeight: 1 }}>{s.score.toFixed(0)}</span>
              </div>
              <span style={{ fontSize: 24, color: INK2, marginTop: 4 }}>{`${scoreWord(s.score)} betting`}</span>
              {top ? <span style={{ fontSize: 20, color: INK3, marginTop: 4 }}>{`${top} of ${s.catalyst.kind === "fda" ? "FDA" : "earnings"} cases`}</span> : null}
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
            <span>Large options bets before the news · rise up, fall down · highlighted: the five days that count</span>
            <span>Not financial advice</span>
          </div>
        </div>
      </div>
    ),
    size,
  );
}

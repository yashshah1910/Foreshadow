import { ImageResponse } from "next/og";
import { getTickerDossier } from "@/lib/data";
import { prettyCompanyName } from "@/lib/data/shared";
import { fmtDate } from "@/lib/format";
import { eventName, OUTCOME_SHORT, outcomeOf } from "@/lib/plain";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "Foreshadow track record for a stock";

const TRAY = "#f2f4f7";
const INK = "#131722";
const INK2 = "#4a5468";
const INK3 = "#626a7b";
const HL = "#ffe14a";

export default async function Image({ params }: { params: Promise<{ t: string }> }) {
  const { t } = await params;
  const d = await getTickerDossier(t).catch(() => null);
  const ticker = (d?.ticker ?? t).toUpperCase();
  const company = d?.company ? prettyCompanyName(d.company.name) : null;
  const finished = (d?.events ?? []).filter((e) => !e.partialWindow && (e.verdict === "matched" || e.verdict === "missed"));
  const top = [...finished].sort((a, b) => b.score - a.score)[0];
  const unusual = finished.filter((e) => e.score >= 40);
  const right = unusual.filter((e) => e.verdict === "matched").length;
  const scored = `${finished.length} news event${finished.length === 1 ? "" : "s"} scored.`;
  const line =
    finished.length === 0
      ? "No finished cases scored yet."
      : unusual.length === 0
        ? `${scored} The options betting before ${finished.length === 1 ? "it was" : "them was"} never unusual.`
        : `${scored} Unusual betting before ${unusual.length} of them, and ${right === 0 ? "none of those bets were right" : `the bets were right ${right} of those times`}.`;

  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", background: TRAY, padding: 40, fontFamily: "sans-serif" }}>
        <div style={{ display: "flex", flexDirection: "column", flex: 1, background: "#ffffff", borderRadius: 28, padding: "44px 56px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ display: "flex", width: 26, height: 22, background: HL, transform: "skewX(-8deg)", borderRadius: 5 }} />
            <div style={{ display: "flex", width: 5, height: 32, background: INK, borderRadius: 3 }} />
            <div style={{ display: "flex", fontSize: 28, color: INK, marginLeft: 6 }}>Foreshadow track record</div>
          </div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 22, marginTop: 34 }}>
            <div style={{ display: "flex", fontSize: 96, fontWeight: 800, color: INK, letterSpacing: -3, lineHeight: 1 }}>{ticker}</div>
            {company ? <div style={{ display: "flex", fontSize: 40, color: INK3 }}>{company}</div> : null}
          </div>
          <div style={{ display: "flex", fontSize: 32, color: INK2, marginTop: 22, lineHeight: 1.3, maxWidth: 980 }}>{line}</div>
          {top ? (
            <div style={{ display: "flex", alignItems: "center", gap: 22, marginTop: "auto", background: TRAY, borderRadius: 20, padding: "18px 24px" }}>
              <div style={{ display: "flex", padding: "0 12px", background: top.score >= 70 ? HL : "transparent", borderRadius: 10, transform: "skewX(-6deg)" }}>
                <span style={{ fontSize: 64, fontWeight: 800, color: INK, lineHeight: 1 }}>{Math.round(top.score)}</span>
              </div>
              <div style={{ display: "flex", flexDirection: "column" }}>
                <span style={{ fontSize: 20, color: INK3 }}>Highest score</span>
                <span style={{ fontSize: 28, color: INK }}>{`${eventName(top)}, ${fmtDate(top.catalyst.eventDate, { year: true })} · ${OUTCOME_SHORT[outcomeOf(top)]}`}</span>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    ),
    size,
  );
}

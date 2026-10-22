import { fallbackDossierSummary, isNarratorConfigured, summarizeDossier } from "@foreshadow/narrator";
import { getDataSource } from "@/lib/data";
import { toDossierInput } from "@/lib/narrator/input";
import { SUMMARY_LIMITS, clientIp, rateLimit } from "@/lib/rate-limit";

const memo = new Map<string, { summary: string; model: string }>();

/** GET /api/dossier?ticker=XYZ — the one-paragraph stock summary. */
export async function GET(request: Request) {
  const ticker = new URL(request.url).searchParams.get("ticker")?.toUpperCase();
  if (!ticker) return Response.json({ error: "ticker is required" }, { status: 400 });
  const d = await getDataSource().getTickerDossier(ticker);
  if (!d) return Response.json({ error: "not found" }, { status: 404 });
  const input = toDossierInput(d);
  const key = `${ticker}:${d.events[0]?.computedAt ?? ""}:${d.events.length}`;
  const hit = memo.get(key);
  if (hit) return Response.json(hit);
  if (!isNarratorConfigured() || !rateLimit("summary", clientIp(request), SUMMARY_LIMITS).ok) {
    return Response.json({ summary: fallbackDossierSummary(input), model: "template" });
  }
  try {
    const out = await summarizeDossier(input);
    memo.set(key, out);
    return Response.json(out);
  } catch (err) {
    console.error("[dossier]", err);
    return Response.json({ summary: fallbackDossierSummary(input), model: "template" });
  }
}

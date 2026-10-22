import { foreshadowSimilar } from "@/lib/tools/foreshadow";

/** GET /api/similar?ticker=XYZ&eventDate=YYYY-MM-DD — finished cases like this one and how they turned out. */
export async function GET(request: Request) {
  const sp = new URL(request.url).searchParams;
  const ticker = sp.get("ticker");
  const eventDate = sp.get("eventDate");
  if (!ticker || !eventDate || !/^\d{4}-\d{2}-\d{2}$/.test(eventDate)) {
    return Response.json({ error: "ticker and eventDate (YYYY-MM-DD) are required" }, { status: 400 });
  }
  return Response.json(await foreshadowSimilar({ ticker, eventDate }), { headers: { "cache-control": "public, max-age=120" } });
}

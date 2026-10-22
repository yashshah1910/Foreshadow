import { foreshadowScore } from "@/lib/tools/foreshadow";

export async function GET(request: Request) {
  const sp = new URL(request.url).searchParams;
  const ticker = sp.get("ticker");
  const eventDate = sp.get("eventDate") ?? sp.get("date");
  if (!ticker || !eventDate) return Response.json({ error: "ticker and eventDate are required" }, { status: 400 });
  return Response.json(await foreshadowScore({ ticker, eventDate }), { headers: { "cache-control": "public, max-age=60" } });
}

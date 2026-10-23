import { foreshadowScore } from "@/lib/tools/foreshadow";

export async function GET(request: Request) {
  const sp = new URL(request.url).searchParams;
  const ticker = sp.get("ticker");
  const eventDate = sp.get("eventDate") ?? sp.get("date");
  if (!ticker || !eventDate) return Response.json({ error: "ticker and eventDate are required" }, { status: 400 });
  const out = await foreshadowScore({ ticker, eventDate });
  // A missing stock or case is a 404, so clients and agents can tell it from an answer.
  if ("error" in out) return Response.json(out, { status: 404 });
  return Response.json(out, { headers: { "cache-control": "public, max-age=60" } });
}

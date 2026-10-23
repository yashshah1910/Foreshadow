import { foreshadowHistory } from "@/lib/tools/foreshadow";

export async function GET(request: Request) {
  const ticker = new URL(request.url).searchParams.get("ticker");
  if (!ticker) return Response.json({ error: "ticker is required" }, { status: 400 });
  const out = await foreshadowHistory({ ticker });
  // A missing stock or case is a 404, so clients and agents can tell it from an answer.
  if ("error" in out) return Response.json(out, { status: 404 });
  return Response.json(out, { headers: { "cache-control": "public, max-age=60" } });
}

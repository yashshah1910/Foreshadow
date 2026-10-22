import { foreshadowHistory } from "@/lib/tools/foreshadow";

export async function GET(request: Request) {
  const ticker = new URL(request.url).searchParams.get("ticker");
  if (!ticker) return Response.json({ error: "ticker is required" }, { status: 400 });
  return Response.json(await foreshadowHistory({ ticker }), { headers: { "cache-control": "public, max-age=60" } });
}

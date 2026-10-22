import { foreshadowRadar } from "@/lib/tools/foreshadow";

export async function GET(request: Request) {
  const sp = new URL(request.url).searchParams;
  const daysAhead = Number(sp.get("daysAhead") ?? 10) || 10;
  const minScore = sp.get("minScore") ? Number(sp.get("minScore")) : undefined;
  return Response.json(await foreshadowRadar({ daysAhead, minScore }), { headers: { "cache-control": "public, max-age=60" } });
}

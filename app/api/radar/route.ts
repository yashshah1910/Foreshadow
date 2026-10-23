import { foreshadowRadar } from "@/lib/tools/foreshadow";

export async function GET(request: Request) {
  const sp = new URL(request.url).searchParams;
  const daysAhead = Number(sp.get("daysAhead") ?? 10);
  const minScore = sp.get("minScore") ? Number(sp.get("minScore")) : undefined;
  if (!Number.isInteger(daysAhead) || daysAhead < 1 || daysAhead > 30) {
    return Response.json({ error: "daysAhead must be a whole number of trading days from 1 to 30" }, { status: 400 });
  }
  if (minScore !== undefined && !(minScore >= 0 && minScore <= 100)) {
    return Response.json({ error: "minScore must be between 0 and 100" }, { status: 400 });
  }
  return Response.json(await foreshadowRadar({ daysAhead, minScore }), { headers: { "cache-control": "public, max-age=60" } });
}

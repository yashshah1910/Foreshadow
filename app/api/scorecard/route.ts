import { foreshadowScorecard } from "@/lib/tools/foreshadow";

/** GET /api/scorecard — how often unusual betting was right, by kind of news and score band. */
export async function GET() {
  return Response.json(await foreshadowScorecard(), { headers: { "cache-control": "public, max-age=300" } });
}

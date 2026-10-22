import { NARRATION_VERSION, fallbackNarration, isNarratorConfigured, narrateEvent } from "@foreshadow/narrator";
import { getDataSource } from "@/lib/data";
import { toNarrationInput } from "@/lib/narrator/input";
import { SUMMARY_LIMITS, clientIp, rateLimit } from "@/lib/rate-limit";

/**
 * GET /api/narrate?id=<catalyst id>
 * Returns the cached narration for (catalyst, score), or asks Claude once and
 * caches it. Without ANTHROPIC_API_KEY it returns the deterministic template.
 */
export async function GET(request: Request) {
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return Response.json({ error: "id is required" }, { status: 400 });
  const ds = getDataSource();
  const ev = await ds.getEvent(id);
  if (!ev) return Response.json({ error: "event not found" }, { status: 404 });

  // Cached write-ups carry the prompt version in their model tag; older ones are rewritten.
  const tag = `@v${NARRATION_VERSION}`;
  const cached = ev.narration ?? (await ds.getNarration(id, ev.summary.score));
  if (cached && cached.model.endsWith(tag)) {
    return Response.json({ narration: { ...cached, model: cached.model.slice(0, -tag.length) }, source: "cached" });
  }

  const input = toNarrationInput(ev);
  // Over the limit: the template still gives the reader a summary, without spending credits.
  if (!isNarratorConfigured() || !rateLimit("summary", clientIp(request), SUMMARY_LIMITS).ok) {
    const n = fallbackNarration(input);
    return Response.json({ narration: { ...n, createdAt: new Date().toISOString() }, source: "fallback" });
  }

  try {
    const n = await narrateEvent(input);
    const narration = { story: n.story, caption: n.caption, model: n.model, numbersVerified: n.numbersVerified, createdAt: new Date().toISOString() };
    if (n.numbersVerified) await ds.saveNarration(id, ev.summary.score, { ...narration, model: `${n.model}${tag}` });
    return Response.json({ narration, source: "claude" });
  } catch (err) {
    console.error("[narrate]", err);
    const n = fallbackNarration(input);
    return Response.json({ narration: { ...n, createdAt: new Date().toISOString() }, source: "fallback" });
  }
}

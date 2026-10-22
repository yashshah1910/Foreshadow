import { fallbackNarration, isNarratorConfigured, narrateEvent } from "@foreshadow/narrator";
import { getDataSource } from "@/lib/data";
import { toNarrationInput } from "@/lib/narrator/input";

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

  const cached = ev.narration ?? (await ds.getNarration(id, ev.summary.score));
  if (cached) return Response.json({ narration: cached, source: "cached" });

  const input = toNarrationInput(ev);
  if (!isNarratorConfigured()) {
    const n = fallbackNarration(input);
    return Response.json({ narration: { ...n, createdAt: new Date().toISOString() }, source: "fallback" });
  }

  try {
    const n = await narrateEvent(input);
    const narration = { story: n.story, caption: n.caption, model: n.model, numbersVerified: n.numbersVerified, createdAt: new Date().toISOString() };
    if (n.numbersVerified) await ds.saveNarration(id, ev.summary.score, narration);
    return Response.json({ narration, source: "claude" });
  } catch (err) {
    console.error("[narrate]", err);
    const n = fallbackNarration(input);
    return Response.json({ narration: { ...n, createdAt: new Date().toISOString() }, source: "fallback" });
  }
}

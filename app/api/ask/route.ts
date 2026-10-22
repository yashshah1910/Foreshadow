import { z } from "zod";
import { investigate, isNarratorConfigured, NarratorError } from "@foreshadow/narrator";
import { foreshadowTools } from "@/lib/tools/foreshadow";
import { env, hasSupabase, UW_MCP_URL } from "@/lib/env";
import { createSupabaseServerClient, createSupabaseServiceClient } from "@/lib/supabase/server";

const Body = z.object({
  question: z.string().trim().min(2).max(600),
  context: z
    .object({
      ticker: z.string().max(12).optional(),
      eventDate: z.string().max(10).optional(),
      summary: z.string().max(600).optional(),
    })
    .optional(),
});

// A small per-process limiter so a public demo can't burn the key.
const hits = new Map<string, number[]>();
function limited(ip: string, max = 8, windowMs = 60_000): boolean {
  const now = Date.now();
  const arr = (hits.get(ip) ?? []).filter((t) => now - t < windowMs);
  if (arr.length >= max) return true;
  arr.push(now);
  hits.set(ip, arr);
  return false;
}

/** The signed-in user's UW key from Vault, else the server's, else none. */
async function uwToken(): Promise<string | undefined> {
  if (hasSupabase()) {
    try {
      const supabase = await createSupabaseServerClient();
      const { data } = await supabase.auth.getUser();
      if (data.user && env.supabaseServiceKey) {
        const svc = createSupabaseServiceClient();
        const { data: key } = await svc.rpc("get_uw_key", { p_user_id: data.user.id });
        if (typeof key === "string" && key) return key;
      }
    } catch {
      // fall through to the server key
    }
  }
  return env.uwApiKey;
}

/** POST /api/ask — the in-app investigator (Claude + Foreshadow tools + UW MCP). */
export async function POST(request: Request) {
  if (!isNarratorConfigured()) {
    return Response.json({ error: "The investigator needs ANTHROPIC_API_KEY on the server." }, { status: 503 });
  }
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  if (limited(ip)) return Response.json({ error: "Too many questions; try again in a minute." }, { status: 429 });

  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "A question between 2 and 600 characters is required." }, { status: 400 });

  const token = await uwToken();
  try {
    const result = await investigate({
      question: parsed.data.question,
      context: parsed.data.context,
      tools: foreshadowTools,
      uwMcp: token ? { url: UW_MCP_URL, token } : undefined,
      maxToolCalls: 6,
    });
    return Response.json(result);
  } catch (err) {
    console.error("[ask]", err);
    const msg = err instanceof NarratorError ? err.message : "The investigator hit an error.";
    return Response.json({ error: msg }, { status: 502 });
  }
}

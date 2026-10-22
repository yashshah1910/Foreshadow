import { z } from "zod";
import { investigate, isNarratorConfigured, NarratorError } from "@foreshadow/narrator";
import { publicAnswer } from "@/lib/ask";
import { ASK_LIMITS, clientIp, rateLimit, waitPhrase } from "@/lib/rate-limit";
import { foreshadowTools } from "@/lib/tools/foreshadow";
import { env, hasSupabase, UW_MCP_URL } from "@/lib/env";
import { createSupabaseServerClient, createSupabaseServiceClient } from "@/lib/supabase/server";

const Body = z.object({
  question: z.string().trim().min(2).max(300),
  context: z
    .object({
      ticker: z.string().max(12).optional(),
      eventDate: z.string().max(10).optional(),
      summary: z.string().max(600).optional(),
    })
    .optional(),
});

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
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Ask a question between 2 and 300 characters." }, { status: 400 });

  const rl = rateLimit("ask", clientIp(request), ASK_LIMITS);
  if (!rl.ok) {
    return Response.json(
      { error: `You've asked a lot of questions. Try again in ${waitPhrase(rl.retryAfter)}.` },
      { status: 429, headers: { "retry-after": String(rl.retryAfter) } },
    );
  }

  const token = await uwToken();
  try {
    const result = await investigate({
      question: parsed.data.question,
      context: parsed.data.context,
      tools: foreshadowTools,
      uwMcp: token ? { url: UW_MCP_URL, token } : undefined,
      maxToolCalls: 4,
    });
    return Response.json(publicAnswer(result));
  } catch (err) {
    console.error("[ask]", err);
    const msg = err instanceof NarratorError ? err.message : "Something went wrong while answering. Try again in a moment.";
    return Response.json({ error: msg }, { status: 502 });
  }
}

import { UwClient } from "@foreshadow/uw";
import { env, hasSupabase } from "@/lib/env";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { runIngest, type IngestMode } from "@/lib/ingest";
import { dispatchAlerts } from "@/lib/alerts";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

/**
 * GET /api/cron/ingest?mode=radar|daily|backfill&max=12&days=90
 * Vercel Cron calls this with `Authorization: Bearer $CRON_SECRET`.
 */
export async function GET(request: Request) {
  const auth = request.headers.get("authorization");
  if (env.cronSecret) {
    if (auth !== `Bearer ${env.cronSecret}`) return Response.json({ error: "unauthorized" }, { status: 401 });
  } else if (process.env.NODE_ENV === "production") {
    return Response.json({ error: "CRON_SECRET is not set" }, { status: 401 });
  }
  if (!hasSupabase() || !env.supabaseServiceKey) {
    return Response.json({ error: "Supabase (with SUPABASE_SECRET_KEY) is required for ingest; this deployment is in demo mode." }, { status: 503 });
  }
  if (!env.uwApiKey) {
    return Response.json({ error: "UW_API_KEY is required for ingest." }, { status: 503 });
  }

  const sp = new URL(request.url).searchParams;
  const mode = (sp.get("mode") ?? "radar") as IngestMode;
  if (!["radar", "daily", "backfill"].includes(mode)) return Response.json({ error: "bad mode" }, { status: 400 });
  const maxEvents = Number(sp.get("max")) || undefined;
  const lookbackDays = Number(sp.get("days")) || undefined;

  const db = createSupabaseServiceClient();
  const uw = new UwClient({ apiKey: env.uwApiKey, logger: (m) => console.log("[uw]", m) });
  const logs: string[] = [];
  const report = await runIngest(db, uw, {
    mode,
    maxEvents,
    lookbackDays,
    // Leave headroom under maxDuration for in-flight events to finish.
    budgetMs: 150_000,
    concurrency: 3,
    log: (m) => {
      logs.push(m);
      console.log("[ingest]", m);
    },
    onScored:
      mode === "radar"
        ? async (change) => {
            await dispatchAlerts(db, change, { siteUrl: env.siteUrl, resendKey: env.resendKey, fromEmail: env.alertsFrom, log: (m) => console.warn("[alerts]", m) });
          }
        : undefined,
  });
  return Response.json({ ...report, log: logs.slice(-50) });
}

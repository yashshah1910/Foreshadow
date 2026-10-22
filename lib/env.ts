/**
 * Environment access in one place. Every key is optional: with nothing set the
 * app runs in demo mode from the seeded fixtures.
 */

export type DataMode = "demo" | "supabase";

function pick(...names: string[]): string | undefined {
  for (const n of names) {
    const v = process.env[n];
    if (v && v.trim() !== "") return v.trim();
  }
  return undefined;
}

export const env = {
  get supabaseUrl() {
    return pick("NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_URL");
  },
  get supabaseAnonKey() {
    return pick(
      "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
      "NEXT_PUBLIC_SUPABASE_ANON_KEY",
      "SUPABASE_ANON_KEY",
    );
  },
  get supabaseServiceKey() {
    return pick("SUPABASE_SECRET_KEY", "SUPABASE_SERVICE_ROLE_KEY");
  },
  get uwApiKey() {
    return pick("UW_API_KEY");
  },
  get anthropicKey() {
    return pick("ANTHROPIC_API_KEY");
  },
  get cronSecret() {
    return pick("CRON_SECRET");
  },
  get siteUrl() {
    return pick("NEXT_PUBLIC_SITE_URL", "VERCEL_PROJECT_PRODUCTION_URL") ?? "http://localhost:3000";
  },
  get resendKey() {
    return pick("RESEND_API_KEY");
  },
  get alertsFrom() {
    return pick("ALERTS_FROM_EMAIL") ?? "alerts@foreshadow.app";
  },
};

export function hasSupabase(): boolean {
  return Boolean(env.supabaseUrl && env.supabaseAnonKey);
}

export function dataMode(): DataMode {
  return hasSupabase() ? "supabase" : "demo";
}

export const UW_MCP_URL = "https://api.unusualwhales.com/api/mcp";

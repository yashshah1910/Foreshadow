import { createServerClient } from "@supabase/ssr";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { env } from "@/lib/env";

/** Per-request client bound to the signed-in user's cookies (RLS applies). */
export async function createSupabaseServerClient(): Promise<SupabaseClient> {
  const url = env.supabaseUrl;
  const key = env.supabaseAnonKey;
  if (!url || !key) throw new Error("Supabase is not configured");
  const cookieStore = await cookies();
  return createServerClient(url, key, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) cookieStore.set(name, value, options);
        } catch {
          // Called from a Server Component: the proxy refreshes sessions instead.
        }
      },
    },
  });
}

let serviceClient: SupabaseClient | null = null;

/** No service-role request may hang: a busy database otherwise stalls a cron run past its limit. */
const SERVICE_REQUEST_TIMEOUT_MS = 60_000;
const fetchWithTimeout: typeof fetch = (input, init) => {
  const timeout = AbortSignal.timeout(SERVICE_REQUEST_TIMEOUT_MS);
  return fetch(input, { ...init, signal: init?.signal ? AbortSignal.any([init.signal, timeout]) : timeout });
};

/** Service-role client for server-only work (cron, caches). Bypasses RLS. */
export function createSupabaseServiceClient(): SupabaseClient {
  const url = env.supabaseUrl;
  const key = env.supabaseServiceKey;
  if (!url || !key) throw new Error("SUPABASE_SECRET_KEY is not configured");
  if (!serviceClient) {
    serviceClient = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { fetch: fetchWithTimeout },
    });
  }
  return serviceClient;
}

/** Read-only data client: service role when available (footprints need it), else anon. */
export function createSupabaseDataClient(): SupabaseClient {
  const url = env.supabaseUrl;
  const key = env.supabaseServiceKey ?? env.supabaseAnonKey;
  if (!url || !key) throw new Error("Supabase is not configured");
  if (env.supabaseServiceKey) return createSupabaseServiceClient();
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

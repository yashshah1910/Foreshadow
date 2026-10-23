import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { env, hasSupabase } from "@/lib/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { sendMagicLink, signInWithGoogle } from "./actions";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const sp = await searchParams;
  const next = typeof sp.next === "string" ? sp.next : "/settings";
  const sent = sp.sent === "1";
  const error = typeof sp.error === "string" ? sp.error : null;

  if (!hasSupabase()) {
    return (
      <Shell>
        <h1 className="display text-[34px]">Sign-in needs Supabase</h1>
        <p className="mt-3 text-[15px] leading-relaxed text-ink-2">
          This deployment runs in demo mode. Set <code className="font-mono text-ink">NEXT_PUBLIC_SUPABASE_URL</code> and{" "}
          <code className="font-mono text-ink">NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY</code> to enable accounts, bring-your-own-key,
          watchlists and alerts.
        </p>
        <Link href="/leaderboard" className="link mt-6 inline-block text-[15px]">Back to past cases</Link>
      </Shell>
    );
  }

  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getUser();
  if (data.user) redirect(next);
  const google = await googleEnabled();

  return (
    <Shell>
      <p className="mb-2 text-[14px] font-medium text-ink-3">Sign in</p>
      <h1 className="display text-[34px]">Get alerts for your stocks.</h1>
      <p className="mt-3 text-[15px] leading-relaxed text-ink-2">
        With an account, Foreshadow posts to your Discord channel when the betting before one of your stocks&apos; news turns
        unusual. You can also add your own Unusual Whales API key for Ask; it is stored encrypted and only used on the
        server.
      </p>
      {sent ? (
        <div className="card mt-6 p-4 text-[15px] text-ink">
          Check your email for a sign-in link.
        </div>
      ) : (
        <>
          <form action={sendMagicLink} className="mt-6 flex flex-col gap-3">
            <input type="hidden" name="next" value={next} />
            <label htmlFor="email" className="text-[14px] font-medium text-ink-2">Email</label>
            <input
              id="email"
              name="email"
              type="email"
              required
              autoComplete="email"
              placeholder="you@example.com"
              className="h-11 rounded-xl bg-surface px-4 text-[15px] text-ink placeholder:text-ink-3"
            />
            <button type="submit" className="pressable btn btn-primary w-full">Email me a sign-in link</button>
          </form>
          {google ? (
            <form action={signInWithGoogle} className="mt-3">
              <input type="hidden" name="next" value={next} />
              <button type="submit" className="pressable btn w-full bg-surface text-ink hover:bg-surface-3">
                Continue with Google
              </button>
            </form>
          ) : null}
        </>
      )}
      {error ? (
        <p className="mt-4 text-[14px] text-put-ink" role="alert">
          {ERRORS[error] ?? `Sign-in failed: ${error}`}
        </p>
      ) : null}
    </Shell>
  );
}

const ERRORS: Record<string, string> = {
  email: "Enter a full email address.",
  link: "That sign-in link has expired or was already used. Ask for a new one below.",
  auth: "That sign-in link has expired or was already used. Ask for a new one below.",
};

/** Whether the Supabase project has Google sign-in switched on (its public settings say so); checked hourly. */
async function googleEnabled(): Promise<boolean> {
  try {
    const res = await fetch(`${env.supabaseUrl}/auth/v1/settings`, {
      headers: { apikey: env.supabaseAnonKey ?? "" },
      next: { revalidate: 3600 },
    });
    const json = (await res.json()) as { external?: { google?: boolean } };
    return Boolean(json.external?.google);
  } catch {
    return false;
  }
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-md px-4 py-16 sm:px-6">
      <div className="tray p-7">{children}</div>
    </div>
  );
}

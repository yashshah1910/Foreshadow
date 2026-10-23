import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { env, hasSupabase } from "@/lib/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { continueAsGuest, signInWithGitHub, signInWithGoogle } from "./actions";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const sp = await searchParams;
  const next = typeof sp.next === "string" ? sp.next : "/settings";
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
  const providers = await enabledProviders();
  const none = !providers.guest && !providers.github && !providers.google;

  return (
    <Shell>
      <p className="mb-2 text-[14px] font-medium text-ink-3">Sign in</p>
      <h1 className="display text-[34px]">Get alerts for your stocks.</h1>
      <p className="mt-3 text-[15px] leading-relaxed text-ink-2">
        With an account, Foreshadow posts to your Discord channel when the betting before one of your stocks&apos; news turns
        unusual. You can also add your own Unusual Whales API key for Ask; it is stored encrypted and only used on the
        server.
      </p>
      <div className="mt-6 grid gap-3">
        {providers.github ? (
          <form action={signInWithGitHub}>
            <input type="hidden" name="next" value={next} />
            <button type="submit" className="pressable btn btn-primary w-full">Continue with GitHub</button>
          </form>
        ) : null}
        {providers.google ? (
          <form action={signInWithGoogle}>
            <input type="hidden" name="next" value={next} />
            <button type="submit" className="pressable btn w-full bg-surface text-ink hover:bg-surface-3">Continue with Google</button>
          </form>
        ) : null}
        {providers.guest ? (
          <form action={continueAsGuest}>
            <input type="hidden" name="next" value={next} />
            <button type="submit" className={`pressable btn w-full ${providers.github || providers.google ? "bg-surface text-ink hover:bg-surface-3" : "btn-primary"}`}>
              Continue as a guest
            </button>
            <p className="mt-2 text-[13px] leading-relaxed text-ink-3">
              No email needed. Your settings stay with this browser; signing out ends the guest account.
            </p>
          </form>
        ) : null}
        {none ? (
          <p className="card p-4 text-[15px] leading-relaxed text-ink-2">
            Accounts aren&apos;t open yet. Everything else works without one: your watchlist is kept on this device, and
            Coming up has a calendar and an RSS feed.
          </p>
        ) : null}
      </div>
      {error ? (
        <p className="mt-4 text-[14px] text-put-ink" role="alert">
          {ERRORS[error] ?? `Sign-in failed: ${error}`}
        </p>
      ) : null}
    </Shell>
  );
}

const ERRORS: Record<string, string> = {
  auth: "Sign-in didn't finish. Try again.",
  busy: "Too many sign-ins from here. Try again in a few minutes.",
  oauth: "Sign-in didn't start. Try again.",
};

/** Which sign-in options the Supabase project has switched on (its public settings say so); checked every 10 minutes. */
async function enabledProviders(): Promise<{ guest: boolean; github: boolean; google: boolean }> {
  try {
    const res = await fetch(`${env.supabaseUrl}/auth/v1/settings`, {
      headers: { apikey: env.supabaseAnonKey ?? "" },
      next: { revalidate: 600 },
    });
    const ext = ((await res.json()) as { external?: Record<string, boolean> }).external ?? {};
    return { guest: Boolean(ext.anonymous_users), github: Boolean(ext.github), google: Boolean(ext.google) };
  } catch {
    return { guest: false, github: false, google: false };
  }
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-md px-4 py-16 sm:px-6">
      <div className="tray p-7">{children}</div>
    </div>
  );
}

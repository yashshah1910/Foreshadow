import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { hasSupabase } from "@/lib/env";
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
        <p className="mt-3 text-[14px] text-ink-2">
          This deployment runs in demo mode. Set <code className="font-mono text-ink">NEXT_PUBLIC_SUPABASE_URL</code> and{" "}
          <code className="font-mono text-ink">NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY</code> to enable accounts, bring-your-own-key,
          watchlists and alerts.
        </p>
        <Link href="/leaderboard" className="mt-6 inline-block text-[13px] text-ink-2 underline underline-offset-4">Back to the leaderboard</Link>
      </Shell>
    );
  }

  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getUser();
  if (data.user) redirect(next);

  return (
    <Shell>
      <p className="label mb-2">Sign in</p>
      <h1 className="display text-[34px]">Bring your own key.</h1>
      <p className="mt-2 text-[14px] text-ink-2">
        An account stores your Unusual Whales API key encrypted in Supabase Vault, used only server-side for Live
        Radar, fresh scoring and the Ask panel. Foreshadow never re-serves UW data.
      </p>
      {sent ? (
        <div className="mt-6 rounded-[10px] border border-line-strong bg-surface-2 p-4 text-[14px] text-ink">
          Check your email for a sign-in link.
        </div>
      ) : (
        <>
          <form action={sendMagicLink} className="mt-6 flex flex-col gap-3">
            <input type="hidden" name="next" value={next} />
            <label htmlFor="email" className="text-[12.5px] text-ink-2">Email</label>
            <input
              id="email"
              name="email"
              type="email"
              required
              autoComplete="email"
              placeholder="you@example.com"
              className="h-10 rounded-md border hairline bg-surface-2 px-3 text-[14px] text-ink placeholder:text-ink-3"
            />
            <button type="submit" className="pressable h-10 rounded-md bg-ink text-[14px] font-medium text-surface">Send a magic link</button>
          </form>
          <form action={signInWithGoogle} className="mt-3">
            <input type="hidden" name="next" value={next} />
            <button type="submit" className="pressable h-10 w-full rounded-md border hairline bg-surface text-[14px] text-ink hover:bg-surface-2">
              Continue with Google
            </button>
          </form>
        </>
      )}
      {error ? <p className="mt-4 text-[13px] text-put" role="alert">Sign-in failed: {error}</p> : null}
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-md px-4 py-16 sm:px-6">
      <div className="sheet p-6">{children}</div>
    </div>
  );
}

import Link from "next/link";
import { cookies } from "next/headers";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function AuthMenu() {
  // Guest accounts have no email, so "signed in" is whether there is a user at all.
  let signedIn = false;
  let email: string | null = null;
  // Anonymous visitors carry no Supabase auth cookie: skip the round-trip to Auth.
  const hasSession = (await cookies()).getAll().some((c) => c.name.startsWith("sb-") && c.name.includes("auth-token"));
  if (hasSession) try {
    const supabase = await createSupabaseServerClient();
    const { data } = await supabase.auth.getUser();
    signedIn = Boolean(data.user);
    email = data.user?.email || null;
  } catch {
    signedIn = false;
  }
  return (
    <Link
      href={signedIn ? "/settings" : "/login"}
      title={email ?? undefined}
      className="hidden shrink-0 whitespace-nowrap rounded-full px-3.5 py-2 text-[15px] font-medium text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink sm:inline"
    >
      {signedIn ? "Settings" : "Sign in"}
    </Link>
  );
}

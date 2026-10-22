import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function AuthMenu() {
  let email: string | null = null;
  try {
    const supabase = await createSupabaseServerClient();
    const { data } = await supabase.auth.getUser();
    email = data.user?.email ?? null;
  } catch {
    email = null;
  }
  return (
    <Link
      href={email ? "/settings" : "/login"}
      title={email ?? undefined}
      className="hidden rounded-full px-3.5 py-2 text-[15px] font-medium text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink sm:inline"
    >
      {email ? "Settings" : "Sign in"}
    </Link>
  );
}

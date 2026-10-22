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
    <Link href={email ? "/settings" : "/login"} title={email ?? undefined} className="hidden px-2 text-[14px] text-ink-2 hover:text-ink sm:inline">
      {email ? "Settings" : "Sign in"}
    </Link>
  );
}

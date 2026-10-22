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
      className="pressable hidden h-8 items-center rounded-md bg-ink px-3 text-[13px] font-medium text-surface sm:inline-flex"
    >
      {email ? "Settings" : "Sign in"}
    </Link>
  );
}

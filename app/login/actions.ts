"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { SIGN_IN_LIMITS, clientIp, rateLimit } from "@/lib/rate-limit";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { env } from "@/lib/env";

/**
 * Sign-in without email: a guest account (Supabase anonymous sign-in) or
 * GitHub / Google through Supabase OAuth. Each button only shows when that
 * provider is switched on in the Supabase project (see the login page).
 */

function callbackUrl(next: string) {
  return `${env.siteUrl.replace(/\/$/, "")}/auth/callback?next=${encodeURIComponent(next)}`;
}

function safeNext(formData: FormData): string {
  const next = String(formData.get("next") ?? "/settings");
  return next.startsWith("/") && !next.startsWith("//") ? next : "/settings";
}

export async function continueAsGuest(formData: FormData): Promise<void> {
  const next = safeNext(formData);
  const ip = clientIp(new Request("http://local", { headers: await headers() }));
  if (!rateLimit("sign-in", ip, SIGN_IN_LIMITS).ok) redirect("/login?error=busy");
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInAnonymously();
  if (error) redirect(`/login?error=${encodeURIComponent(error.message)}`);
  redirect(next);
}

async function signInWith(provider: "github" | "google", formData: FormData): Promise<void> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: { redirectTo: callbackUrl(safeNext(formData)) },
  });
  if (error || !data.url) redirect(`/login?error=${encodeURIComponent(error?.message ?? "oauth")}`);
  redirect(data.url);
}

export async function signInWithGitHub(formData: FormData): Promise<void> {
  return signInWith("github", formData);
}

export async function signInWithGoogle(formData: FormData): Promise<void> {
  return signInWith("google", formData);
}

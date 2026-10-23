"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { SIGN_IN_LIMITS, clientIp, rateLimit } from "@/lib/rate-limit";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { env } from "@/lib/env";
import { sendSignInEmail } from "@/lib/sign-in-email";

function callbackUrl(next: string) {
  return `${env.siteUrl.replace(/\/$/, "")}/auth/callback?next=${encodeURIComponent(next)}`;
}

export async function sendMagicLink(formData: FormData): Promise<void> {
  const email = String(formData.get("email") ?? "").trim();
  const next = String(formData.get("next") ?? "/settings");
  if (!email.includes("@")) redirect("/login?error=email");
  const safeNext = next.startsWith("/") && !next.startsWith("//") ? next : "/settings";
  const ip = clientIp(new Request("http://local", { headers: await headers() }));
  if (!rateLimit("sign-in", ip, SIGN_IN_LIMITS).ok) redirect("/login?error=Too%20many%20sign-in%20emails.%20Try%20again%20in%20a%20few%20minutes.");
  // Resend first (no Supabase mailer limits); Supabase's own mailer if Resend can't deliver to this address.
  let sentByResend = false;
  try {
    sentByResend = await sendSignInEmail(email, safeNext);
  } catch (err) {
    console.warn("[sign-in] resend path failed", err);
  }
  if (sentByResend) redirect("/login?sent=1");
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: callbackUrl(next) } });
  if (error) redirect(`/login?error=${encodeURIComponent(error.message)}`);
  redirect(`/login?sent=1`);
}

export async function signInWithGoogle(formData: FormData): Promise<void> {
  const next = String(formData.get("next") ?? "/settings");
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: callbackUrl(next) },
  });
  if (error || !data.url) redirect(`/login?error=${encodeURIComponent(error?.message ?? "oauth")}`);
  redirect(data.url);
}

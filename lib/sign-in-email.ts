import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { env } from "@/lib/env";

/** Resend's shared sender, usable before a domain of our own is verified (it then only reaches the account owner). */
const SHARED_SENDER = "Foreshadow <onboarding@resend.dev>";

/**
 * Sends a sign-in link through Resend: Supabase makes the one-time token
 * (creating the account on first sign-in) and /auth/confirm redeems it.
 * Returns false when Resend can't deliver to this address, so the caller can
 * fall back to Supabase's own mailer.
 */
export async function sendSignInEmail(email: string, next: string): Promise<boolean> {
  if (!env.resendKey || !env.supabaseServiceKey) return false;
  const admin = createSupabaseServiceClient();
  let link = await admin.auth.admin.generateLink({ type: "magiclink", email });
  if (link.error) {
    // First sign-in: make the account, then ask again.
    const created = await admin.auth.admin.createUser({ email, email_confirm: true });
    if (created.error) return false;
    link = await admin.auth.admin.generateLink({ type: "magiclink", email });
    if (link.error) return false;
  }
  const tokenHash = link.data.properties?.hashed_token;
  if (!tokenHash) return false;
  const base = env.siteUrl.replace(/\/$/, "");
  const url = `${base}/auth/confirm?token_hash=${encodeURIComponent(tokenHash)}&type=magiclink&next=${encodeURIComponent(next)}`;

  const { Resend } = await import("resend");
  const resend = new Resend(env.resendKey);
  const message = {
    to: email,
    subject: "Your Foreshadow sign-in link",
    text: `Sign in to Foreshadow: ${url}\n\nThe link works once and expires in an hour. If you didn't ask for it, ignore this email.`,
    html: `<p>Sign in to Foreshadow:</p><p><a href="${url}">Sign in</a></p><p style="color:#626a7b">The link works once and expires in an hour. If you didn't ask for it, ignore this email.</p>`,
  };
  // Our own sender first; Resend refuses it until that domain is verified, so try the shared one next.
  for (const from of [...new Set([env.alertsFrom, SHARED_SENDER])]) {
    const { error } = await resend.emails.send({ ...message, from });
    if (!error) return true;
    console.warn("[sign-in] resend", from, error.message);
  }
  return false;
}

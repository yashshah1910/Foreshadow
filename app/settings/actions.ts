"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

async function requireUser() {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect("/login?next=/settings");
  return { supabase, user: data.user };
}

export async function saveUwKey(formData: FormData): Promise<void> {
  const { supabase } = await requireUser();
  const key = String(formData.get("uw_key") ?? "").trim();
  if (key.length < 16) redirect("/settings?error=key");
  const { error } = await supabase.rpc("set_uw_key", { p_key: key });
  if (error) redirect(`/settings?error=${encodeURIComponent(error.message)}`);
  revalidatePath("/settings");
  redirect("/settings?saved=key");
}

export async function deleteUwKey(): Promise<void> {
  const { supabase } = await requireUser();
  await supabase.rpc("delete_uw_key");
  revalidatePath("/settings");
  redirect("/settings?saved=key-removed");
}

export async function saveWatchlist(formData: FormData): Promise<void> {
  const { supabase, user } = await requireUser();
  const raw = String(formData.get("tickers") ?? "");
  const tickers = [...new Set(raw.toUpperCase().split(/[\s,]+/).map((t) => t.trim()).filter((t) => /^[A-Z.]{1,8}$/.test(t)))].slice(0, 50);
  const id = String(formData.get("id") ?? "");
  const row = { user_id: user.id, name: "Watchlist", tickers };
  const { error } = id
    ? await supabase.from("watchlists").update(row).eq("id", id).eq("user_id", user.id)
    : await supabase.from("watchlists").insert(row);
  if (error) redirect(`/settings?error=${encodeURIComponent(error.message)}`);
  revalidatePath("/settings");
  redirect("/settings?saved=watchlist");
}

export async function addAlert(formData: FormData): Promise<void> {
  const { supabase, user } = await requireUser();
  const kind = String(formData.get("kind") ?? "discord");
  const target = String(formData.get("target") ?? "").trim();
  const minScore = Math.min(100, Math.max(0, Number(formData.get("min_score") ?? 70) || 70));
  const tickersRaw = String(formData.get("tickers") ?? "").trim();
  const tickers = tickersRaw ? tickersRaw.toUpperCase().split(/[\s,]+/).filter((t) => /^[A-Z.]{1,8}$/.test(t)).slice(0, 50) : null;
  const ok =
    (kind === "discord" && /^https:\/\/(discord\.com|discordapp\.com)\/api\/webhooks\//.test(target)) ||
    (kind === "email" && target.includes("@"));
  if (!ok) redirect("/settings?error=alert");
  const { error } = await supabase.from("alerts").insert({ user_id: user.id, kind, target, min_score: minScore, tickers });
  if (error) redirect(`/settings?error=${encodeURIComponent(error.message)}`);
  revalidatePath("/settings");
  redirect("/settings?saved=alert");
}

export async function deleteAlert(formData: FormData): Promise<void> {
  const { supabase, user } = await requireUser();
  const id = String(formData.get("id") ?? "");
  await supabase.from("alerts").delete().eq("id", id).eq("user_id", user.id);
  revalidatePath("/settings");
  redirect("/settings");
}

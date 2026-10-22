/**
 * Alert dispatch: when a Live Radar score crosses a user's threshold, post to
 * their Discord webhook or send an email via Resend. Runs inside the cron with
 * the service role; never from the browser.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Catalyst, StoredScore } from "@foreshadow/core";

interface AlertRow {
  id: string;
  user_id: string;
  kind: "discord" | "email";
  target: string;
  min_score: number | string;
  tickers: string[] | null;
  enabled: boolean;
}

export interface AlertDeps {
  siteUrl: string;
  resendKey?: string;
  fromEmail: string;
  fetch?: typeof fetch;
  log?: (msg: string) => void;
}

export async function dispatchAlerts(
  db: SupabaseClient,
  change: { prev: StoredScore | null; next: StoredScore; catalyst: Catalyst },
  deps: AlertDeps,
): Promise<number> {
  const { prev, next, catalyst } = change;
  const { data } = await db.from("alerts").select("id, user_id, kind, target, min_score, tickers, enabled").eq("enabled", true).lte("min_score", next.score);
  const rows = (data ?? []) as AlertRow[];
  let fired = 0;
  for (const a of rows) {
    const min = Number(a.min_score);
    if (a.tickers && a.tickers.length > 0 && !a.tickers.includes(catalyst.ticker)) continue;
    if (prev && prev.score >= min) continue; // already above the line last time
    const url = `${deps.siteUrl.replace(/\/$/, "")}/event/${encodeURIComponent(catalyst.id)}`;
    const headline = `${catalyst.ticker} ${catalyst.title} · score ${next.score.toFixed(0)} (${next.direction}) · ${next.flags.footprintDaysUsed} of 5 days in`;
    try {
      if (a.kind === "discord") await postDiscord(a.target, headline, url, next, deps);
      else await sendEmail(a.target, headline, url, deps);
      await db.from("alerts").update({ last_fired_at: new Date().toISOString() }).eq("id", a.id);
      fired += 1;
    } catch (err) {
      deps.log?.(`alert ${a.id} failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  return fired;
}

async function postDiscord(webhook: string, headline: string, url: string, s: StoredScore, deps: AlertDeps) {
  const f = deps.fetch ?? fetch;
  const res = await f(webhook, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      username: "Foreshadow",
      embeds: [
        {
          title: headline,
          url,
          description: `Someone may know. Direction ${s.direction}, score ${s.score.toFixed(1)} on a partial window. Not financial advice.`,
          color: s.direction === "bearish" ? 0xd4455f : s.direction === "bullish" ? 0x1f9b8d : 0xe8b84a,
        },
      ],
    }),
  });
  if (!res.ok) throw new Error(`discord ${res.status}`);
}

async function sendEmail(to: string, headline: string, url: string, deps: AlertDeps) {
  if (!deps.resendKey) throw new Error("RESEND_API_KEY not configured");
  const { Resend } = await import("resend");
  const resend = new Resend(deps.resendKey);
  const { error } = await resend.emails.send({
    from: deps.fromEmail,
    to,
    subject: `Foreshadow: ${headline}`,
    text: `${headline}\n\n${url}\n\nNot financial advice.`,
  });
  if (error) throw new Error(error.message);
}

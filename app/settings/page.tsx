import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { env, hasSupabase } from "@/lib/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { addAlert, deleteAlert, deleteUwKey, saveUwKey, saveWatchlist } from "./actions";

export const metadata: Metadata = { title: "Settings" };

interface AlertRow {
  id: string;
  kind: "discord" | "email";
  target: string;
  min_score: number;
  tickers: string[] | null;
  enabled: boolean;
  last_fired_at: string | null;
}

export default async function SettingsPage({ searchParams }: PageProps<"/settings">) {
  const sp = await searchParams;
  const saved = typeof sp.saved === "string" ? sp.saved : null;
  const error = typeof sp.error === "string" ? sp.error : null;

  if (!hasSupabase()) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
        <p className="mb-2 text-[14px] font-medium text-ink-3">Settings</p>
        <h1 className="display text-[34px]">Demo mode</h1>
        <div className="mt-4 tray p-6 text-[14px] text-ink-2 space-y-3">
          <p>This deployment has no Supabase project configured, so it serves the seeded dataset and has no accounts.</p>
          <p>To turn on accounts, bring-your-own-key, watchlists, alerts and Coming up updates:</p>
          <ol className="list-decimal space-y-1 pl-5">
            <li>Create a free Supabase project and run <code className="font-mono text-ink">pnpm supabase db push</code> (or <code className="font-mono text-ink">db reset</code> locally).</li>
            <li>Set <code className="font-mono text-ink">NEXT_PUBLIC_SUPABASE_URL</code>, <code className="font-mono text-ink">NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY</code> and <code className="font-mono text-ink">SUPABASE_SECRET_KEY</code>.</li>
            <li>Add <code className="font-mono text-ink">UW_API_KEY</code> (or sign in and add yours) and <code className="font-mono text-ink">CRON_SECRET</code>, then hit <code className="font-mono text-ink">/api/cron/ingest</code>.</li>
          </ol>
          <McpSnippet />
        </div>
      </div>
    );
  }

  const supabase = await createSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect("/login?next=/settings");
  const user = auth.user;

  const [{ data: keyRow }, { data: watchlist }, { data: alerts }] = await Promise.all([
    supabase.from("user_keys").select("key_hint, updated_at").eq("user_id", user.id).maybeSingle(),
    supabase.from("watchlists").select("id, tickers").eq("user_id", user.id).order("created_at").limit(1).maybeSingle(),
    supabase.from("alerts").select("id, kind, target, min_score, tickers, enabled, last_fired_at").eq("user_id", user.id).order("created_at"),
  ]);

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <div className="mb-6 flex items-end justify-between gap-4">
        <div>
          <p className="mb-2 text-[14px] font-medium text-ink-3">Settings</p>
          <h1 className="display text-[34px]">{user.email || (user.is_anonymous ? "Guest account" : "Your account")}</h1>
        </div>
        <form action="/auth/signout" method="post">
          <button type="submit" className="pressable rounded-full bg-surface-2 px-3 py-1.5 text-[13px] text-ink-2 hover:text-ink">Sign out</button>
        </form>
      </div>

      {saved ? <p className="mb-4 rounded-xl bg-surface-2 px-3 py-2 text-[13px] text-ink" role="status">Saved.</p> : null}
      {error ? <p className="mb-4 rounded-xl bg-put-soft px-3 py-2 text-[13px] text-ink" role="alert">Could not save: {error === "key" ? "that doesn't look like a UW key" : error === "alert" ? "check the Discord webhook URL" : error}.</p> : null}

      <Section title="Unusual Whales API key" blurb="Stored in Supabase Vault, decrypted only on the server for your requests. Used for the Ask panel's Unusual Whales lookups.">
        {keyRow ? (
          <p className="mb-3 text-[13px] text-ink-2">
            A key ending in <span className="font-mono text-ink">…{keyRow.key_hint}</span> is on file (updated {String(keyRow.updated_at).slice(0, 10)}).
          </p>
        ) : null}
        <form action={saveUwKey} className="flex flex-col gap-2 sm:flex-row">
          <label htmlFor="uw_key" className="sr-only">UW API key</label>
          <input id="uw_key" name="uw_key" type="password" autoComplete="off" placeholder={keyRow ? "Replace key" : "Paste your UW API key"} className="h-10 flex-1 rounded-xl bg-surface px-3 font-mono text-[13px] text-ink placeholder:font-sans placeholder:text-ink-3" />
          <button type="submit" className="pressable h-10 rounded-md bg-ink px-4 text-[13px] font-medium text-surface">Save key</button>
          {keyRow ? (
            <button formAction={deleteUwKey} type="submit" className="pressable h-10 rounded-full bg-surface-2 px-3 text-[13px] text-ink-2 hover:text-ink">Remove</button>
          ) : null}
        </form>
      </Section>

      <Section title="Watchlist" blurb="Tickers you care about. Alerts can be limited to them.">
        <form action={saveWatchlist} className="flex flex-col gap-2 sm:flex-row">
          <input type="hidden" name="id" value={watchlist?.id ?? ""} />
          <label htmlFor="tickers" className="sr-only">Tickers</label>
          <input id="tickers" name="tickers" defaultValue={(watchlist?.tickers ?? []).join(", ")} placeholder="TSLA, AAPL, ACAD" className="h-10 flex-1 rounded-xl bg-surface px-3 font-mono text-[13px] uppercase text-ink placeholder:normal-case placeholder:font-sans placeholder:text-ink-3" />
          <button type="submit" className="pressable h-10 rounded-md bg-ink px-4 text-[13px] font-medium text-surface">Save</button>
        </form>
      </Section>

      <Section title="Alerts" blurb="Posts to a Discord channel when a Coming up score crosses your threshold. In Discord: channel settings, Integrations, Webhooks, New webhook, copy its URL.">
        {(alerts as AlertRow[] | null)?.length ? (
          <ul className="mb-4 grid gap-1.5">
            {(alerts as AlertRow[]).map((a) => (
              <li key={a.id} className="card flex items-center gap-3 px-4 py-2.5 text-[14px]">
                <span className="rounded-full bg-surface-2 px-2.5 py-0.5 text-[12px] font-medium text-ink-2">{a.kind}</span>
                <span className="min-w-0 flex-1 truncate text-ink">{a.target}</span>
                <span className="text-ink-3 tnum">≥ {Number(a.min_score)}</span>
                <span className="text-ink-3">{a.tickers?.length ? a.tickers.join(" ") : "all tickers"}</span>
                <form action={deleteAlert}>
                  <input type="hidden" name="id" value={a.id} />
                  <button type="submit" className="pressable text-[12px] text-ink-3 hover:text-ink">Delete</button>
                </form>
              </li>
            ))}
          </ul>
        ) : null}
        <form action={addAlert} className="grid gap-2 sm:grid-cols-[1fr_5rem_8rem_auto]">
          <input type="hidden" name="kind" value="discord" />
          <input name="target" aria-label="Discord webhook URL" placeholder="https://discord.com/api/webhooks/…" className="h-10 rounded-xl bg-surface px-3 text-[13px] text-ink placeholder:text-ink-3" />
          <input name="min_score" type="number" min={0} max={100} defaultValue={70} aria-label="Minimum score" className="h-10 rounded-xl bg-surface px-3 text-[13px] text-ink tnum" />
          <input name="tickers" aria-label="Tickers (optional)" placeholder="tickers, optional" className="h-10 rounded-xl bg-surface px-3 font-mono text-[13px] uppercase text-ink placeholder:normal-case placeholder:font-sans placeholder:text-ink-3" />
          <button type="submit" className="pressable h-10 rounded-md bg-ink px-4 text-[13px] font-medium text-surface">Add</button>
        </form>
      </Section>

      <Section title="MCP" blurb="Add Foreshadow to Claude or Cursor as one URL.">
        <McpSnippet />
      </Section>
    </div>
  );
}

function Section({ title, blurb, children }: { title: string; blurb: string; children: React.ReactNode }) {
  return (
    <section className="mb-6 tray p-6">
      <h2 className="display text-[19px]">{title}</h2>
      <p className="mb-4 mt-1 text-[12.5px] text-ink-3">{blurb}</p>
      {children}
    </section>
  );
}

function McpSnippet() {
  const base = env.siteUrl.replace(/\/$/, "");
  return (
    <div className="text-[13px]">
      <pre className="overflow-x-auto rounded-xl bg-surface p-3 font-mono text-[12px] text-ink-2">{`claude mcp add --transport http foreshadow ${base}/api/mcp`}</pre>
      <p className="mt-2 text-ink-3">
        Tools: <code className="font-mono">foreshadow_score</code>, <code className="font-mono">foreshadow_radar</code>, <code className="font-mono">foreshadow_history</code>. See the <Link href="/docs#mcp" className="underline underline-offset-4">docs</Link>.
      </p>
    </div>
  );
}

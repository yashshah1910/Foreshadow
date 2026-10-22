"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { RadarItem } from "@/lib/data";
import { CaseList } from "@/components/cases/CaseList";
import { Legend } from "@/components/cases/Legend";
import { KindTag } from "@/components/viz/Marks";
import { fmtDate, fmtPct } from "@/lib/format";
import { directionPlain, eventName } from "@/lib/plain";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { useWatchlist } from "@/lib/hooks/useWatchlist";

export function RadarList({
  items,
  live,
  leadHistory = null,
}: {
  items: RadarItem[];
  live: boolean;
  /** How similar past betting turned out, for the lead case the server saw (shown only while it is still the lead). */
  leadHistory?: { id: string; text: string } | null;
}) {
  const router = useRouter();
  const [lastEvent, setLastEvent] = useState<string | null>(null);

  // Supabase Realtime: any change to `scores` refreshes the server data in place.
  useEffect(() => {
    if (!live) return;
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    const channel = supabase
      .channel("radar-scores")
      .on("postgres_changes", { event: "*", schema: "public", table: "scores" }, () => {
        setLastEvent(new Date().toLocaleTimeString());
        router.refresh();
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [live, router]);

  // When the radar last scored anything, shown relative and refreshed each minute (client-only to avoid hydration drift).
  const latest = items.reduce<string | null>((m, i) => (i.computedAt && (!m || i.computedAt > m) ? i.computedAt : m), null);
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => setNow(Date.now());
    tick();
    const t = setInterval(tick, 60_000);
    return () => clearInterval(t);
  }, []);
  const { list: watched } = useWatchlist();
  const mine = items.filter((i) => watched.includes(i.catalyst.ticker));
  const open = items.filter((i) => i.windowOpen);
  const upcoming = items.filter((i) => !i.windowOpen);
  const lead = open.filter((i) => i.daysElapsed > 0).sort((a, b) => b.score - a.score)[0] ?? null;
  // A calendar: one group per news day, soonest first, most unusual first within the day.
  const byDay = [...open.reduce((m, r) => m.set(r.catalyst.eventDate, [...(m.get(r.catalyst.eventDate) ?? []), r]), new Map<string, RadarItem[]>())]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([day, rows]) => [day, rows.sort((a, b) => b.score - a.score)] as const);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-3 text-[14px] text-ink-3">
        <span className="inline-flex items-center gap-2 rounded-full bg-surface-2 px-3 py-1.5 font-medium text-ink-2">
          <span className={`h-2 w-2 rounded-full ${live ? "bg-call motion-safe:animate-pulse" : "bg-ink-3"}`} aria-hidden="true" />
          {live ? "Live: this list updates on its own" : "Sample data: these scores don't change"}
        </span>
        {latest && now ? (
          <span className="tnum">
            Last scored {ago(Date.parse(latest), now)}
            {live && !marketHours(now) ? ". Markets are closed; scores refresh every 15 minutes while US markets are open." : ""}
          </span>
        ) : null}
        {lastEvent ? <span className="tnum">Updated {lastEvent}</span> : null}
        <span className="ml-auto flex flex-wrap gap-x-4 gap-y-1">
          <a href="/calendar.ics" className="link text-[14px]" title="Subscribe in Google, Apple or Outlook calendar">
            Add to calendar
          </a>
          <a href="/feed.xml" className="link text-[14px]">Follow by RSS</a>
        </span>
      </div>
      {watched.length > 0 ? (
        <section aria-labelledby="mine-h" className="mb-10">
          <h2 id="mine-h" className="mb-3 flex items-baseline gap-3 px-1">
            <span className="text-[19px] font-semibold text-ink">Your stocks</span>
            <span className="text-[14px] text-ink-3">watching {watched.join(", ")} on this device</span>
            <a href={`/calendar.ics?tickers=${watched.join(",")}`} className="link ml-auto text-[14px]">
              Put their news in your calendar
            </a>
          </h2>
          {mine.length > 0 ? (
            <CaseList rows={mine} mode="live" />
          ) : (
            <p className="tray px-6 py-5 text-[15px] text-ink-2">
              None of your stocks has news in the next two weeks. Foreshadow will list them here once one does.
            </p>
          )}
        </section>
      ) : null}
      {lead ? (
        <Link
          href={`/event/${encodeURIComponent(lead.catalyst.id)}`}
          className="tray group mb-10 flex flex-wrap items-center gap-x-6 gap-y-3 p-6 transition-colors hover:bg-surface-3"
        >
          <span className="min-w-[16rem] flex-1">
            <span className="block text-[14px] font-medium text-ink-3">Most unusual betting so far</span>
            <span className="mt-1.5 block text-[22px] font-semibold leading-snug text-ink">
              <span className="ticker">{lead.catalyst.ticker}</span> {eventName(lead)}, {fmtDate(lead.catalyst.eventDate, { weekday: true })}
            </span>
            <span className="mt-1 block text-[15.5px] text-ink-2">
              {lead.score.toFixed(0)} out of 100 after {lead.daysElapsed} of {lead.daysTotal} days, {directionPlain(lead.direction).toLowerCase()}.
              Options are pricing in a move of about ±{fmtPct(lead.impliedMovePct, { sign: false, decimals: 0 })}.
            </span>
            {leadHistory?.id === lead.catalyst.id ? <span className="mt-2 block text-[14.5px] text-ink-3">{leadHistory.text}</span> : null}
          </span>
          <span className="text-[15px] font-semibold text-ink group-hover:underline group-hover:underline-offset-4">Open the case</span>
        </Link>
      ) : null}
      {byDay.length === 0 ? (
        <CaseList
          rows={[]}
          mode="live"
          empty={
          <>
            <p className="text-[16px] font-medium text-ink">Nothing is inside its five-day window right now.</p>
            <p className="mt-1 text-[15px] text-ink-3">
              Scores start as soon as the next piece of news is five trading days away. Until then,{" "}
              <Link href="/leaderboard" className="link">browse past cases</Link>.
            </p>
          </>
          }
        />
      ) : (
        <div className="grid gap-10">
          {byDay.map(([day, rows], i) => (
            <section key={day} aria-label={`News on ${fmtDate(day, { weekday: true })}`}>
              <h2 className="mb-3 flex items-baseline gap-3 px-1">
                <span className="text-[19px] font-semibold text-ink">{fmtDate(day, { weekday: true })}</span>
                <span className="text-[14.5px] text-ink-3">
                  {rows.length} {rows.length === 1 ? "company" : "companies"}
                </span>
              </h2>
              <CaseList rows={rows} mode="live" header={i === 0} />
            </section>
          ))}
        </div>
      )}
      {open.length ? <Legend live /> : null}

      {upcoming.length > 0 ? (
        <section className="mt-24" aria-labelledby="upcoming-h">
          <h2 id="upcoming-h" className="display mb-2 text-[34px] text-ink">Later this month</h2>
          <p className="mb-6 text-[16px] text-ink-2">Scheduled news whose five-day window hasn&apos;t started yet.</p>
          <ul className="tray grid gap-1.5 p-2 sm:grid-cols-2 sm:p-2.5">
            {upcoming.map((r) => (
              <li key={r.catalyst.id}>
                <Link
                  href={`/event/${encodeURIComponent(r.catalyst.id)}`}
                  className="card flex items-center gap-3 px-4 py-3.5 transition-shadow duration-200 hover:shadow-[0_2px_12px_rgba(19,23,34,0.08)]"
                >
                  <span className="ticker w-14 shrink-0 text-[15px] text-ink">{r.catalyst.ticker}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] text-ink">{r.catalyst.title}</span>
                    <span className="mt-1.5 flex items-center gap-2.5 text-[13.5px] text-ink-3">
                      <KindTag kind={r.catalyst.kind} />
                      <span className="tnum">{fmtDate(r.catalyst.eventDate, { weekday: true })}</span>
                    </span>
                  </span>
                  <span className="shrink-0 text-right text-[13.5px] text-ink-3 tnum">counting from<br />{fmtDate(r.windowStart)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

/** Weekdays 9 AM to 5 PM New York time, when the radar refresh runs (holidays aside). */
function marketHours(now: number): boolean {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", weekday: "short", hour: "numeric", hourCycle: "h23" }).formatToParts(now);
  const day = parts.find((p) => p.type === "weekday")?.value ?? "";
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? 0);
  return !["Sat", "Sun"].includes(day) && hour >= 9 && hour < 17;
}

function ago(then: number, now: number): string {
  const min = Math.max(0, Math.round((now - then) / 60_000));
  if (min < 1) return "just now";
  if (min < 60) return `${min} minute${min === 1 ? "" : "s"} ago`;
  const h = Math.round(min / 60);
  if (h < 48) return `${h} hour${h === 1 ? "" : "s"} ago`;
  return `${Math.round(h / 24)} days ago`;
}

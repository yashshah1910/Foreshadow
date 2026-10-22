"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { RadarItem } from "@/lib/data";
import { CaseList } from "@/components/cases/CaseList";
import { Legend } from "@/components/cases/Legend";
import { KindTag } from "@/components/viz/Marks";
import { fmtDate } from "@/lib/format";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

export function RadarList({ items, live }: { items: RadarItem[]; live: boolean }) {
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

  const open = items.filter((i) => i.windowOpen);
  const upcoming = items.filter((i) => !i.windowOpen);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-3 text-[14px] text-ink-3">
        <span className="inline-flex items-center gap-2 rounded-full bg-surface-2 px-3 py-1.5 font-medium text-ink-2">
          <span className={`h-2 w-2 rounded-full ${live ? "bg-call motion-safe:animate-pulse" : "bg-ink-3"}`} aria-hidden="true" />
          {live ? "Live: this list updates on its own" : "Sample data: these scores don't change"}
        </span>
        {lastEvent ? <span className="tnum">Updated {lastEvent}</span> : null}
      </div>
      <CaseList
        rows={open}
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

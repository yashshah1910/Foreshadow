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
      <div className="mb-3 flex items-center gap-3 text-[12.5px] text-ink-3">
        <span className="inline-flex items-center gap-2">
          <span className={`h-2 w-2 rounded-full ${live ? "bg-call motion-safe:animate-pulse" : "bg-ink-3"}`} aria-hidden="true" />
          {live ? "Live: rows update in place when the cron re-scores" : "Demo dataset: scores are frozen at Oct 22"}
        </span>
        {lastEvent ? <span className="font-mono tnum">updated {lastEvent}</span> : null}
      </div>
      <CaseList
        rows={open}
        mode="live"
        empty={<p className="text-[14px] text-ink-2">No footprint windows are open right now.</p>}
      />
      <Legend live />

      {upcoming.length > 0 ? (
        <section className="mt-14" aria-labelledby="upcoming-h">
          <h2 id="upcoming-h" className="display mb-1 text-[24px]">Opening soon</h2>
          <p className="mb-4 text-[13px] text-ink-3">Catalysts whose five-session window hasn&apos;t started yet.</p>
          <ul className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
            {upcoming.map((r) => (
              <li key={r.catalyst.id}>
                <Link
                  href={`/event/${encodeURIComponent(r.catalyst.id)}`}
                  className="sheet pressable flex items-center gap-3 px-4 py-3.5 hover:border-line-strong"
                >
                  <span className="w-12 font-mono text-[13.5px] font-semibold text-ink">{r.catalyst.ticker}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] text-ink">{r.catalyst.title}</span>
                    <span className="mt-1 flex items-center gap-2 text-[12px] text-ink-3">
                      <KindTag kind={r.catalyst.kind} />
                      <span className="tnum">{fmtDate(r.catalyst.eventDate, { weekday: true })}</span>
                    </span>
                  </span>
                  <span className="text-right font-mono text-[11.5px] text-ink-3 tnum">
                    opens
                    <br />
                    {fmtDate(r.windowStart)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

import type { Metadata } from "next";
import { getRadar, getToday } from "@/lib/data";
import { hasSupabase } from "@/lib/env";
import { RadarList } from "@/components/radar/RadarList";
import { fmtDate } from "@/lib/format";

export const metadata: Metadata = {
  title: "Live Radar",
  description: "Upcoming catalysts in the next ten trading days, scored on today's partial footprint window.",
};

export default async function RadarPage({ searchParams }: PageProps<"/radar">) {
  const sp = await searchParams;
  const min = Number(Array.isArray(sp.min) ? sp.min[0] : sp.min) || undefined;
  const [items, today] = await Promise.all([getRadar(10, min), getToday()]);
  return (
    <div className="mx-auto max-w-[1200px] px-4 py-10 sm:px-6 lg:py-14">
      <header className="mb-8 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)] lg:items-end">
        <div>
          <p className="label mb-3">Live Radar · {fmtDate(today, { year: true, weekday: true })}</p>
          <h1 className="display text-[44px] sm:text-[60px]">Building right now.</h1>
        </div>
        <p className="text-[14.5px] leading-relaxed text-ink-2">
          Every catalyst in the next ten sessions, scored on the part of its five-session window that has already
          happened. Scores refresh every 15 minutes in market hours when a UW key is configured.
        </p>
      </header>
      <RadarList items={items} live={hasSupabase()} />
    </div>
  );
}

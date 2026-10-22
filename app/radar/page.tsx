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
    <div className="mx-auto max-w-[1080px] px-5 py-12 sm:px-8 lg:py-16">
      <header className="mb-10 max-w-[760px]">
        <h1 className="display text-[40px] text-ink sm:text-[52px]">Coming up</h1>
        <p className="prose-plain mt-4">
          News scheduled in the next two weeks. Once a stock enters the five trading days before its news, Foreshadow starts
          scoring the betting, and the score updates through the day. The dots show how many of the five days have passed.
          As of {fmtDate(today, { year: true, weekday: true })}.
        </p>
      </header>
      <RadarList items={items} live={hasSupabase()} />
    </div>
  );
}

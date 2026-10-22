import type { Metadata } from "next";
import { getLeaderboard, getRadar, getToday } from "@/lib/data";
import { similarCases } from "@/lib/similar";
import { hasSupabase } from "@/lib/env";
import { RadarList } from "@/components/radar/RadarList";
import { AskPanel } from "@/components/event/AskPanel";
import { fmtDate } from "@/lib/format";

export const metadata: Metadata = {
  title: "Coming up",
  description: "Company news due in the next two weeks, with the options betting scored day by day as it builds.",
};

export default async function RadarPage({ searchParams }: PageProps<"/radar">) {
  const sp = await searchParams;
  const min = Number(Array.isArray(sp.min) ? sp.min[0] : sp.min) || undefined;
  const [items, today] = await Promise.all([getRadar(10, min), getToday()]);
  // How betting like the lead case's has turned out before, chosen the same way the list picks its lead.
  const lead = items.filter((i) => i.windowOpen && i.daysElapsed > 0).sort((a, b) => b.score - a.score)[0];
  let leadHistory: { id: string; text: string } | null = null;
  if (lead && lead.direction !== "mixed") {
    const sim = similarCases(lead, await getLeaderboard({ kind: lead.catalyst.kind, days: 365, limit: 400 }));
    const n = sim.cases.length;
    if (n >= 3) {
      const kind = lead.catalyst.kind === "fda" ? "FDA news" : "earnings";
      leadHistory = {
        id: lead.catalyst.id,
        text: `Before ${kind}, betting like this (scoring ${sim.lo} to ${sim.hi}, leaning toward a ${lead.direction === "bullish" ? "rise" : "fall"}) has played out ${n} times. The stock moved the bets' way in ${sim.wentTheirWay} and beat the expected move in ${sim.right}.`,
      };
    }
  }
  return (
    <div className="mx-auto max-w-[1120px] px-5 py-12 sm:px-8 lg:py-16">
      <header className="mb-10 max-w-[760px]">
        <h1 className="display text-[44px] text-ink sm:text-[60px]">Coming up</h1>
        <p className="prose-plain mt-5">
          News scheduled in the next two weeks. Once a stock enters the five trading days before its news, Foreshadow starts
          scoring the betting, and the score updates through the day. The dots show how many of the five days have passed.
          As of {fmtDate(today, { year: true, weekday: true })}.
          {items.some((i) => i.catalyst.kind === "fda") ? null : (
            <> No FDA decisions with a firm date fall in this window right now, so everything below is earnings.</>
          )}
        </p>
      </header>
      <RadarList items={items} live={hasSupabase()} leadHistory={leadHistory} />
      <div className="mt-16 max-w-[760px]">
        <AskPanel scope="radar" summary={`The reader is on Coming up, the list of company news due in the next two weeks, as of ${today}.`} />
      </div>
    </div>
  );
}

import type { Metadata } from "next";
import { Suspense } from "react";
import { getLeaderboard, getToday } from "@/lib/data";
import type { CatalystKind } from "@foreshadow/core";
import { CaseList } from "@/components/cases/CaseList";
import { Filters } from "@/components/leaderboard/Filters";
import { readFilters } from "@/components/leaderboard/filters-state";
import { Legend } from "@/components/cases/Legend";
import { fmtDate } from "@/lib/format";

export const metadata: Metadata = {
  title: "Leaderboard",
  description: "The highest-scoring catalysts: where informed options positioning showed up before the news, and whether it matched the move.",
};

export default async function LeaderboardPage({ searchParams }: PageProps<"/leaderboard">) {
  const sp = await searchParams;
  const f = readFilters(sp);
  const [rows, today] = await Promise.all([
    getLeaderboard({
      kind: f.kind as CatalystKind | "all",
      minScore: f.min70 ? 70 : undefined,
      matchedOnly: f.matched,
      days: f.days,
      limit: 20,
    }),
    getToday(),
  ]);

  return (
    <div className="mx-auto max-w-[1200px] px-4 py-10 sm:px-6 lg:py-14">
      <header className="mb-8 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)] lg:items-end">
        <div>
          <p className="label mb-3">Leaderboard · as of {fmtDate(today, { year: true })}</p>
          <h1 className="display text-[44px] sm:text-[60px]">Where someone knew.</h1>
        </div>
        <p className="text-[14.5px] leading-relaxed text-ink-2">
          The top past catalysts by Foreshadow score, and whether the footprint matched the move. Index and ETF tickers
          never rank; tickers with under 20 sessions of history are left out.
        </p>
      </header>
      <div className="mb-3">
        <Suspense>
          <Filters initial={f} total={rows.length} />
        </Suspense>
      </div>
      <CaseList rows={rows} />
      <Legend />
    </div>
  );
}

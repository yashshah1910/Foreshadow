import type { Metadata } from "next";
import { Suspense } from "react";
import { getLeaderboard, getToday } from "@/lib/data";
import type { CatalystKind } from "@foreshadow/core";
import { CaseList } from "@/components/cases/CaseList";
import { Filters } from "@/components/leaderboard/Filters";
import { PAGE, readFilters } from "@/components/leaderboard/filters-state";
import Link from "next/link";
import { Legend } from "@/components/cases/Legend";
import { fmtDate } from "@/lib/format";

export const metadata: Metadata = {
  title: "Past cases",
  description: "Company news from the last few months, ranked by how unusual the options betting was in the five days before it, and whether the bets were right.",
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
      limit: f.show,
    }),
    getToday(),
  ]);

  return (
    <div className="mx-auto max-w-[1120px] px-5 py-12 sm:px-8 lg:py-16">
      <header className="mb-10 max-w-[760px]">
        <h1 className="display text-[44px] text-ink sm:text-[60px]">Past cases</h1>
        <p className="prose-plain mt-5">
          News from the last few months, ranked by how unusual the options betting was in the five days before it, with
          what the stock did next. Funds and stocks with too little trading history are left out. Updated{" "}
          {fmtDate(today, { year: true })}.
        </p>
      </header>
      <div className="mb-5">
        <Suspense>
          <Filters initial={f} total={rows.length} />
        </Suspense>
      </div>
      <CaseList rows={rows} />
      {rows.length >= f.show && f.show < 200 ? (
        <div className="mt-5 flex justify-center">
          <Link href={moreHref(sp, f.show + PAGE)} scroll={false} className="pressable btn btn-soft">
            Show 20 more cases
          </Link>
        </div>
      ) : null}
      <Legend />
    </div>
  );
}

function moreHref(sp: Record<string, string | string[] | undefined>, show: number): string {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) {
    if (k === "show" || v === undefined) continue;
    params.set(k, Array.isArray(v) ? v[0] : v);
  }
  params.set("show", String(show));
  return `/leaderboard?${params}`;
}

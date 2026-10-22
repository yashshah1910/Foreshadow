import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTickerDossier, getToday } from "@/lib/data";
import { Timeline } from "@/components/dossier/Timeline";
import { DossierSummary } from "@/components/dossier/DossierSummary";
import { CaseList } from "@/components/cases/CaseList";
import { fmtMarketcap } from "@/lib/format";

export async function generateMetadata({ params }: PageProps<"/ticker/[t]">): Promise<Metadata> {
  const { t } = await params;
  return { title: `${t.toUpperCase()} dossier`, description: `Every scored catalyst for ${t.toUpperCase()} and how often the footprint matched the move.` };
}

export default async function TickerPage({ params }: PageProps<"/ticker/[t]">) {
  const { t } = await params;
  const [dossier, today] = await Promise.all([getTickerDossier(t), getToday()]);
  if (!dossier) notFound();
  const { ticker, company, events, hitRate } = dossier;
  const past = events.filter((e) => !e.partialWindow && e.catalyst.eventDate <= today);
  const upcoming = events.filter((e) => e.partialWindow || e.catalyst.eventDate > today);
  const fallback =
    past.length === 0
      ? `${ticker} has no finished catalysts scored yet.`
      : `Before ${hitRate.scored} past news events for ${ticker}, the betting was very unusual ${hitRate.strong} times, and those bets were right ${hitRate.strongMatched} times.`;

  return (
    <div className="mx-auto max-w-[1080px] px-5 py-12 sm:px-8 lg:py-16">
      <header className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,30rem)] lg:items-end">
        <div className="min-w-0">
          <p className="mb-2 text-[14.5px] text-ink-3">Track record</p>
          <h1 className="display text-[40px] text-ink sm:text-[52px]">
            <span className="font-mono text-[0.85em] font-semibold tracking-tight">{ticker}</span>
            {company ? <span className="text-ink-2"> {company.name}</span> : null}
          </h1>
          {company ? (
            <p className="mt-3 text-[13.5px] text-ink-3">
              {company.sector}
              {company.marketcap ? ` · ${fmtMarketcap(company.marketcap)} market cap` : ""}
            </p>
          ) : null}
        </div>
        <div>
          {past.length > 0 ? (
            <p className="prose-plain">
              Before <strong>{hitRate.scored}</strong> past news events, the betting was very unusual{" "}
              <strong>{hitRate.strong}</strong> time{hitRate.strong === 1 ? "" : "s"}
              {hitRate.strong > 0 ? (
                <>
                  , and those bets were right <strong>{hitRate.strongMatched}</strong> time{hitRate.strongMatched === 1 ? "" : "s"}.
                </>
              ) : "."}
            </p>
          ) : null}
        </div>
      </header>

      <section className="mt-10 grid gap-8 border-t hairline pt-8 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]" aria-label="Track record">
        <div>
          <p className="mb-3 text-[14px] font-medium text-ink-3">In short</p>
          <DossierSummary ticker={ticker} fallback={fallback} />
        </div>
        <div>
          <p className="mb-2 text-[13.5px] text-ink-3">Every case for {ticker}: higher dots mean more unusual betting; a ring means the bets were right.</p>
          <Timeline events={events} />
        </div>
      </section>

      {upcoming.length > 0 ? (
        <section className="mt-14" aria-labelledby="up-h">
          <h2 id="up-h" className="display mb-4 text-[28px] text-ink">Coming up</h2>
          <CaseList rows={upcoming} animate={false} mode="live" showYear />
        </section>
      ) : null}

      <section className="mt-14" aria-labelledby="past-h">
        <h2 id="past-h" className="display mb-4 text-[28px] text-ink">Past cases</h2>
        <CaseList rows={past} animate={false} showYear />
      </section>
    </div>
  );
}

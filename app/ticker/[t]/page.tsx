import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTickerDossier, getToday } from "@/lib/data";
import { Timeline } from "@/components/dossier/Timeline";
import { DossierSummary } from "@/components/dossier/DossierSummary";
import { CaseList } from "@/components/cases/CaseList";
import { fmtMarketcap } from "@/lib/format";

export async function generateMetadata({ params }: PageProps<"/ticker/[t]">): Promise<Metadata> {
  const { t } = await params;
  return { title: `${t.toUpperCase()} track record`, description: `Every past news event for ${t.toUpperCase()}, how unusual the options betting was before each, and how often the bets were right.` };
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
    <div className="mx-auto max-w-[1120px] px-5 py-12 sm:px-8 lg:py-16">
      <header className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,30rem)] lg:items-end">
        <div className="min-w-0">
          <p className="mb-3 text-[15px] font-medium text-ink-3">Track record</p>
          <h1 className="display text-[44px] text-ink sm:text-[60px]">
            <span className="ticker tracking-normal">{ticker}</span>
            {company ? <span className="text-ink-2"> {company.name}</span> : null}
          </h1>
          {company ? (
            <p className="mt-3 text-[15px] text-ink-3">
              {company.sector}
              {company.marketcap ? `, ${fmtMarketcap(company.marketcap)} market value` : ""}
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

      <section className="mt-12 grid gap-1.5 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]" aria-label="Track record">
        <div className="tray p-6">
          <p className="mb-3 text-[14px] font-medium text-ink-3">In short</p>
          <DossierSummary ticker={ticker} fallback={fallback} />
        </div>
        <div className="tray p-6">
          <p className="mb-4 text-[14.5px] text-ink-2">Every case for {ticker}. Higher dots mean more unusual betting, and a ring means the bets were right.</p>
          <Timeline events={events} />
        </div>
      </section>

      {upcoming.length > 0 ? (
        <section className="mt-24" aria-labelledby="up-h">
          <h2 id="up-h" className="display mb-6 text-[34px] text-ink">Coming up</h2>
          <CaseList rows={upcoming} animate={false} mode="live" showYear />
        </section>
      ) : null}

      <section className="mt-24" aria-labelledby="past-h">
        <h2 id="past-h" className="display mb-6 text-[34px] text-ink">Past cases</h2>
        <CaseList rows={past} animate={false} showYear />
      </section>
    </div>
  );
}

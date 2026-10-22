import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTickerDossier, getToday } from "@/lib/data";
import { Timeline } from "@/components/dossier/Timeline";
import { DossierSummary } from "@/components/dossier/DossierSummary";
import { CaseList } from "@/components/cases/CaseList";
import { fmtDate, fmtMarketcap } from "@/lib/format";
import { KindTag } from "@/components/viz/Marks";
import { AskPanel } from "@/components/event/AskPanel";
import { WatchButton } from "@/components/shell/WatchButton";

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
      <header className="grid grid-cols-[minmax(0,1fr)] gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,30rem)] lg:items-end">
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
          <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-3">
            <WatchButton ticker={ticker} />
            <a href={`/feed.xml?ticker=${ticker}`} className="link text-[15px]">
              Follow {ticker} by RSS
            </a>
          </div>
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

      {dossier.queued ? (
        <section className="tray mt-12 p-6 sm:p-8" aria-labelledby="queued-h">
          <h2 id="queued-h" className="display text-[28px] text-ink">Not scored yet</h2>
          <p className="mt-3 max-w-[640px] text-[16px] leading-relaxed text-ink-2">
            Foreshadow has {ticker}&apos;s news on file but hasn&apos;t scored the betting before it yet. Scoring runs in the
            background, so check back soon.
          </p>
          <ul className="mt-6 grid gap-1.5">
            {dossier.queued.map((q) => (
              <li key={`${q.kind}-${q.eventDate}-${q.title}`} className="card flex flex-wrap items-center gap-x-3 gap-y-1 px-5 py-3.5">
                <KindTag kind={q.kind} />
                <span className="text-[15.5px] text-ink">{q.title}</span>
                <span className="ml-auto text-[14px] text-ink-3 tnum">{fmtDate(q.eventDate, { year: true })}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {events.length > 0 ? (
      <>
      <section className="mt-12 grid grid-cols-[minmax(0,1fr)] gap-1.5 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]" aria-label="Track record">
        <div className="tray p-6">
          <p className="mb-3 text-[14px] font-medium text-ink-3">In short</p>
          <DossierSummary ticker={ticker} fallback={fallback} />
        </div>
        <div className="tray min-w-0 p-6">
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

      <div className="mt-24 max-w-[640px]">
        <AskPanel
          scope="stock"
          ticker={ticker}
          summary={`${ticker}${company ? ` (${company.name})` : ""}: ${hitRate.scored} scored cases, very unusual ${hitRate.strong} times, right ${hitRate.strongMatched} of those.`}
        />
      </div>
      </>
      ) : null}
    </div>
  );
}

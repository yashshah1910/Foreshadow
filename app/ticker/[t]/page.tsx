import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTickerDossier, getToday } from "@/lib/data";
import { Timeline } from "@/components/dossier/Timeline";
import { DossierSummary } from "@/components/dossier/DossierSummary";
import { CaseList } from "@/components/cases/CaseList";
import { Highlight } from "@/components/viz/Highlight";
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
      : `${hitRate.strong} of the last ${hitRate.scored} catalysts for ${ticker} left a 70+ footprint, and ${hitRate.strongMatched} of those matched the move.`;

  return (
    <div className="mx-auto max-w-[1200px] px-4 py-10 sm:px-6 lg:py-14">
      <header className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,30rem)] lg:items-end">
        <div className="min-w-0">
          <p className="label mb-4">Ticker dossier</p>
          <h1>
            <span className="block font-mono text-[52px] font-semibold leading-none tracking-tight text-ink sm:text-[72px]">{ticker}</span>
            {company ? <span className="display mt-3 block text-[28px] text-ink-2 sm:text-[34px]">{company.name}</span> : null}
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
            <p className="display text-[26px] leading-[1.15] sm:text-[30px]">
              <Highlight draw>{`${hitRate.strong} of ${hitRate.scored}`}</Highlight> catalysts left a 70+ footprint.{" "}
              <span className="text-ink-3">{hitRate.strongMatched} matched the move.</span>
            </p>
          ) : null}
        </div>
      </header>

      <section className="sheet mt-10 grid gap-0 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]" aria-label="Track record">
        <div className="border-b hairline px-6 py-5 lg:border-b-0 lg:border-r">
          <p className="label mb-3">The read</p>
          <DossierSummary ticker={ticker} fallback={fallback} />
        </div>
        <div className="px-3 py-4 sm:px-5">
          <p className="label mb-2 px-2">Every case · ring = matched · hollow = still filling</p>
          <Timeline events={events} />
        </div>
      </section>

      {upcoming.length > 0 ? (
        <section className="mt-14" aria-labelledby="up-h">
          <h2 id="up-h" className="display mb-4 text-[26px]">Coming up</h2>
          <CaseList rows={upcoming} animate={false} mode="live" showYear />
        </section>
      ) : null}

      <section className="mt-14" aria-labelledby="past-h">
        <h2 id="past-h" className="display mb-4 text-[26px]">Past cases</h2>
        <CaseList rows={past} animate={false} showYear />
      </section>
    </div>
  );
}

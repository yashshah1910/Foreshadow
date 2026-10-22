import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getEvent, getLeaderboard, getToday } from "@/lib/data";
import type { EventSummary } from "@/lib/data";
import { similarCases, type Similar } from "@/lib/similar";
import { reactionWindowFor } from "@foreshadow/core";
import { Trace } from "@/components/event/Trace";
import { AlertsPanel } from "@/components/event/AlertsPanel";
import { ScoreReceipt } from "@/components/event/ScoreReceipt";
import { Narration } from "@/components/event/Narration";
import { AskPanel } from "@/components/event/AskPanel";
import { ShareButton } from "@/components/event/ShareButton";
import { CaseList } from "@/components/cases/CaseList";
import { KindTag, VerdictMark, WindowMeter } from "@/components/viz/Marks";
import { Explain } from "@/components/ui/Explain";
import type { GlossaryKey } from "@/lib/glossary";
import { caseSummary, directionPlain, eventName, eventPhrase, factsFromStored, scoreWord, verdictPlain } from "@/lib/plain";
import { fmtDate, fmtPct } from "@/lib/format";

export async function generateMetadata({ params }: PageProps<"/event/[id]">): Promise<Metadata> {
  const { id } = await params;
  const ev = await getEvent(decodeURIComponent(id));
  if (!ev) return { title: "Case not found" };
  const s = ev.summary;
  const title = `${s.catalyst.ticker}: ${eventName(s)}`;
  const description = caseSummary(s, factsFromStored(ev.stored));
  return { title, description, openGraph: { title, description }, twitter: { title, description } };
}

export default async function EventPage({ params }: PageProps<"/event/[id]">) {
  const { id } = await params;
  const [ev, today] = await Promise.all([getEvent(decodeURIComponent(id)), getToday()]);
  if (!ev) notFound();
  const { summary: s, stored, windowDays, chartBars, related } = ev;
  const rw = reactionWindowFor(s.catalyst.eventDate, s.catalyst.session);
  const facts = factsFromStored(stored);
  const session =
    s.catalyst.session === "premarket" ? "before the market opened" : s.catalyst.session === "afterhours" ? "after the market closed" : null;
  const pastRelated = related.filter((r) => r.catalyst.eventDate <= today).slice(0, 6);
  const pool = await getLeaderboard({ kind: s.catalyst.kind, limit: 400 });
  const similar = similarCases(s, pool);
  const notes: string[] = [];
  if (s.flags.insufficientHistory) notes.push("This stock had little options trading before, so the comparison is less reliable.");
  if (s.flags.multiCatalyst) notes.push("Another piece of news fell in the same week, so some of the betting may be about that.");
  if (s.flags.isIndexOrEtf) notes.push("This is a fund, not a single company, so it isn't ranked.");

  return (
    <div className="mx-auto max-w-[1120px] px-5 sm:px-8">
      <nav className="flex flex-wrap items-center gap-2 pt-6 text-[14.5px] text-ink-3" aria-label="Breadcrumb">
        <Link href="/leaderboard" className="hover:text-ink">Past cases</Link>
        <span aria-hidden="true">/</span>
        <Link href={`/ticker/${s.catalyst.ticker}`} className="hover:text-ink">All {s.catalyst.ticker} cases</Link>
      </nav>

      {/* ---------------- What happened ---------------- */}
      <header className="max-w-[800px] pt-10">
        <p className="flex flex-wrap items-center gap-x-3 gap-y-2 text-[15px] text-ink-2">
          <KindTag kind={s.catalyst.kind} />
          <span>
            {s.company?.name ? `${s.company.name}, ` : ""}
            {fmtDate(s.catalyst.eventDate, { year: true, weekday: true })}
            {session && s.catalyst.kind !== "earnings" ? `, ${session}` : ""}
          </span>
        </p>
        <h1 className="display mt-4 text-[40px] text-ink sm:text-[56px]">
          <span className="ticker tracking-normal">{s.catalyst.ticker}</span> {eventName(s)}
        </h1>
        <p className="prose-plain mt-6 text-[19px]">{caseSummary(s, facts)}</p>
        {notes.length ? (
          <ul className="mt-5 space-y-1.5 text-[15px] text-ink-3">
            {notes.map((n) => (
              <li key={n}>Note: {n}</li>
            ))}
          </ul>
        ) : null}
      </header>

      <dl className="tray mt-10 grid grid-cols-2 gap-2 p-2 md:grid-cols-5">
        <Fact label="Unusual betting" explain="score">
          <span className="numeral text-[34px] text-ink">{s.score >= 70 ? <span className="hl">{s.score.toFixed(0)}</span> : s.score.toFixed(0)}</span>
          <span className="text-[15px] text-ink-3"> / 100</span>
          <span className="mt-1 block text-[14px] text-ink-3">{scoreWord(s.score)}</span>
        </Fact>
        <Fact label="The bets leaned" explain="lean">
          <span className="text-[19px] font-semibold text-ink">{directionPlain(s.direction)}</span>
        </Fact>
        <Fact label="Expected move" explain="expected">
          <span className="numeral text-[26px] text-ink">±{fmtPct(s.impliedMovePct, { sign: false })}</span>
          <span className="mt-1 block text-[14px] text-ink-3">priced in by options</span>
        </Fact>
        <Fact label={rw.reactionWindow === "T" ? "Actual move that day" : "Actual move, next day"} explain="actual">
          <span className="numeral text-[26px] text-ink">{s.verdict === "pending" ? "—" : fmtPct(s.realizedMovePct)}</span>
        </Fact>
        <Fact label="Result" explain="result">
          {s.partialWindow ? (
            <span className="flex flex-col gap-2 text-[15px] text-ink-2">
              <WindowMeter elapsed={stored.flags.footprintDaysUsed} total={5} />
              {stored.flags.footprintDaysUsed} of 5 days in
            </span>
          ) : (
            <span className="flex flex-col gap-2">
              <VerdictMark verdict={s.verdict} size="lg" />
              <span className="text-[14px] text-ink-3">{verdictPlain(s.verdict).toLowerCase()}</span>
            </span>
          )}
        </Fact>
      </dl>

      {/* ---------------- The chart ---------------- */}
      <section aria-labelledby="chart-h" className="mt-24">
        <h2 id="chart-h" className="display text-[32px] text-ink">The days before, one by one</h2>
        <p className="mt-3 max-w-[720px] text-[16px] leading-relaxed text-ink-2">
          The line is the stock price. Under it is each measurement that goes into the score. The yellow days are the five
          that count; the faded ones show what&apos;s normal for this stock. The number at the right of each row is how many of
          the 100 points it added.
        </p>
        <div className="tray mt-7 p-2">
          <div className="card px-4 pb-3 pt-6 sm:px-7 sm:pt-7">
          <Trace
            bars={chartBars}
            daily={stored.breakdown.daily}
            windowDays={windowDays}
            eventDate={s.catalyst.eventDate}
            reactionDate={s.partialWindow ? null : rw.to}
            signals={stored.breakdown.signals}
            eventLabel={eventPhrase(s)}
            replay
          />
          </div>
        </div>
        <p className="mt-3 px-1 text-[14px] text-ink-3">Hover over a day to see its numbers, or select the chart and use the arrow keys.</p>
      </section>

      {/* ---------------- Trades + Claude ---------------- */}
      <div className="mt-24 grid gap-14 lg:grid-cols-[minmax(0,1fr)_400px] lg:gap-12">
        <div className="grid content-start gap-16">
          <AlertsPanel trades={ev.sampleTrades ?? []} ticker={s.catalyst.ticker} stats={ev.alertStats ?? { count: 0, premium: 0 }} />
          <details className="group tray p-6">
            <summary className="flex cursor-pointer list-none flex-wrap items-baseline justify-between gap-3">
              <span className="display text-[24px] text-ink">How the score adds up</span>
              <span className="text-[15px] font-medium text-ink-2 group-open:hidden">Show the math</span>
              <span className="hidden text-[15px] font-medium text-ink-2 group-open:inline">Hide</span>
            </summary>
            <div className="mt-5">
              <ScoreReceipt signals={stored.breakdown.signals} score={s.score} />
            </div>
          </details>
        </div>
        <div className="grid content-start gap-4">
          <Narration catalystId={s.catalyst.id} score={s.score} initial={null} />
          <AskPanel
            ticker={s.catalyst.ticker}
            eventDate={s.catalyst.eventDate}
            summary={`${s.catalyst.ticker} ${s.catalyst.title} on ${s.catalyst.eventDate}: score ${s.score}, ${s.direction}, verdict ${s.verdict}.`}
          />
          <ShareButton id={s.catalyst.id} />
        </div>
      </div>

      <section className="mt-28" aria-labelledby="similar-h">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-4">
          <h2 id="similar-h" className="display text-[32px] text-ink">Cases like this one</h2>
          <Link href="/scorecard" className="link shrink-0 text-[15px]">See the full scorecard</Link>
        </div>
        <p className="prose-plain mb-6 max-w-[720px]">{similarSentence(s, similar)}</p>
        {similar.cases.length > 0 ? <CaseList rows={similar.cases.slice(0, 5)} showYear /> : null}
      </section>

      {pastRelated.length > 0 ? (
        <section className="mt-28" aria-labelledby="related-h">
          <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
            <h2 id="related-h" className="display text-[32px] text-ink">Other {s.catalyst.ticker} cases</h2>
            <Link href={`/ticker/${s.catalyst.ticker}`} className="link shrink-0 text-[15px]">
              See {s.catalyst.ticker}&apos;s full track record
            </Link>
          </div>
          <CaseList rows={pastRelated} showYear />
        </section>
      ) : null}
    </div>
  );
}

function Fact({ label, explain, children }: { label: string; explain?: GlossaryKey; children: React.ReactNode }) {
  return (
    <div className="card px-5 py-4">
      <dt className="mb-2 flex items-center text-[14px] font-medium text-ink-3">
        {label}
        {explain ? <Explain term={explain} label={label.toLowerCase()} /> : null}
      </dt>
      <dd>{children}</dd>
    </div>
  );
}

function similarSentence(s: EventSummary, sim: Similar): string {
  const kind = s.catalyst.kind === "fda" ? "FDA" : s.catalyst.kind === "earnings" ? "earnings" : "past";
  const lean = s.direction === "bullish" ? " with bets leaning toward a rise" : s.direction === "bearish" ? " with bets leaning toward a fall" : "";
  const n = sim.cases.length;
  if (n === 0) return `No finished ${kind} cases look like this one yet. As more cases finish, they'll show up here.`;
  const share = Math.round((sim.right / n) * 100);
  const lead = s.verdict === "pending" ? "Betting like this has shown up before. Of" : "Of";
  return `${lead} ${n} finished ${kind} case${n === 1 ? "" : "s"} that scored ${sim.lo} to ${sim.hi}${lean}, the bets were right in ${sim.right} (${share}%).`;
}

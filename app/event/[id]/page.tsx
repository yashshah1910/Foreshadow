import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getEvent, getToday } from "@/lib/data";
import { reactionWindowFor } from "@foreshadow/core";
import { Trace } from "@/components/event/Trace";
import { AlertsPanel } from "@/components/event/AlertsPanel";
import { ScoreReceipt } from "@/components/event/ScoreReceipt";
import { Narration } from "@/components/event/Narration";
import { AskPanel } from "@/components/event/AskPanel";
import { ShareButton } from "@/components/event/ShareButton";
import { CaseList } from "@/components/cases/CaseList";
import { VerdictMark, WindowMeter } from "@/components/viz/Marks";
import { caseSummary, directionPlain, eventName, factsFromStored, kindNoun, scoreWord, verdictPlain } from "@/lib/plain";
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
  const { summary: s, stored, footprint, windowDays, chartBars, related } = ev;
  const alerts = footprint.flatMap((d) => d.alerts);
  const rw = reactionWindowFor(s.catalyst.eventDate, s.catalyst.session);
  const facts = factsFromStored(stored);
  const session =
    s.catalyst.session === "premarket" ? "before the market opened" : s.catalyst.session === "afterhours" ? "after the market closed" : null;
  const pastRelated = related.filter((r) => r.catalyst.eventDate <= today).slice(0, 6);
  const notes: string[] = [];
  if (s.flags.insufficientHistory) notes.push("This stock had little options trading before, so the comparison is less reliable.");
  if (s.flags.multiCatalyst) notes.push("Another piece of news fell in the same week, so some of the betting may be about that.");
  if (s.flags.isIndexOrEtf) notes.push("This is a fund, not a single company, so it isn't ranked.");

  return (
    <div className="mx-auto max-w-[1080px] px-5 sm:px-8">
      <nav className="pt-8 text-[14px] text-ink-3" aria-label="Breadcrumb">
        <Link href="/leaderboard" className="hover:text-ink">Past cases</Link>
        <span className="mx-2" aria-hidden="true">/</span>
        <Link href={`/ticker/${s.catalyst.ticker}`} className="hover:text-ink">All {s.catalyst.ticker} cases</Link>
      </nav>

      {/* ---------------- What happened ---------------- */}
      <header className="max-w-[780px] pt-8">
        <p className="text-[14.5px] text-ink-3">
          {s.company?.name ?? s.catalyst.ticker} · {kindNoun(s.catalyst.kind)} · {fmtDate(s.catalyst.eventDate, { year: true, weekday: true })}
          {session ? `, ${session}` : ""}
        </p>
        <h1 className="display mt-2 text-[38px] text-ink sm:text-[50px]">
          <span className="font-mono text-[0.82em] font-semibold tracking-tight">{s.catalyst.ticker}</span> {eventName(s)}
        </h1>
        <p className="prose-plain mt-6 text-[18px]">{caseSummary(s, facts)}</p>
        {notes.length ? (
          <ul className="mt-4 space-y-1 text-[14.5px] text-ink-3">
            {notes.map((n) => (
              <li key={n}>Note: {n}</li>
            ))}
          </ul>
        ) : null}
      </header>

      <dl className="mt-10 grid grid-cols-2 gap-x-6 gap-y-6 border-y hairline py-6 md:grid-cols-5">
        <Fact label="Unusual betting">
          <span className="font-mono text-[26px] text-ink tnum">{s.score >= 70 ? <span className="hl">{s.score.toFixed(0)}</span> : s.score.toFixed(0)}</span>
          <span className="text-[15px] text-ink-3"> / 100</span>
          <span className="block text-[13px] text-ink-3">{scoreWord(s.score)}</span>
        </Fact>
        <Fact label="The bets leaned">
          <span className="text-[18px] text-ink">{directionPlain(s.direction)}</span>
        </Fact>
        <Fact label="Expected move">
          <span className="font-mono text-[22px] text-ink tnum">±{fmtPct(s.impliedMovePct, { sign: false })}</span>
          <span className="block text-[13px] text-ink-3">priced in by options</span>
        </Fact>
        <Fact label={rw.reactionWindow === "T" ? "Actual move that day" : "Actual move, next day"}>
          <span className="font-mono text-[22px] text-ink tnum">{s.verdict === "pending" ? "—" : fmtPct(s.realizedMovePct)}</span>
        </Fact>
        <Fact label="Result">
          {s.partialWindow ? (
            <span className="flex flex-col gap-1.5 text-[15px] text-ink-2">
              <WindowMeter elapsed={stored.flags.footprintDaysUsed} total={5} />
              {stored.flags.footprintDaysUsed} of 5 days in
            </span>
          ) : (
            <span className="text-[18px]">
              <VerdictMark verdict={s.verdict} />
              <span className="block text-[13px] text-ink-3">{verdictPlain(s.verdict).toLowerCase()}</span>
            </span>
          )}
        </Fact>
      </dl>

      {/* ---------------- The chart ---------------- */}
      <section aria-labelledby="chart-h" className="mt-14">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="chart-h" className="display text-[26px] text-ink">The week before, day by day</h2>
          <p className="text-[13.5px] text-ink-3">Hover over a day, or tab to the chart and use the arrow keys.</p>
        </div>
        <p className="mt-2 max-w-[760px] text-[15px] leading-relaxed text-ink-2">
          The line is the stock price. Below it, each measurement that goes into the score, day by day. The shaded days are
          the five that count; the others show what&apos;s normal for this stock. The number on the right of each row is how
          many of the 100 points it contributed.
        </p>
        <div className="mt-6">
          <Trace
            bars={chartBars}
            daily={stored.breakdown.daily}
            windowDays={windowDays}
            eventDate={s.catalyst.eventDate}
            reactionDate={s.partialWindow ? null : rw.to}
            signals={stored.breakdown.signals}
            eventLabel={eventName(s)}
          />
        </div>
      </section>

      {/* ---------------- Trades + Claude ---------------- */}
      <div className="mt-14 grid gap-12 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="grid content-start gap-12">
          <AlertsPanel alerts={alerts} ticker={s.catalyst.ticker} />
          <details className="group border-t hairline pt-6">
            <summary className="cursor-pointer list-none">
              <span className="display text-[24px] text-ink">How the score adds up</span>
              <span className="ml-3 text-[14px] text-ink-3 group-open:hidden">Show the math →</span>
            </summary>
            <div className="mt-6">
              <ScoreReceipt signals={stored.breakdown.signals} score={s.score} />
            </div>
          </details>
        </div>
        <div className="grid content-start gap-10">
          <Narration catalystId={s.catalyst.id} score={s.score} initial={null} />
          <AskPanel
            ticker={s.catalyst.ticker}
            eventDate={s.catalyst.eventDate}
            summary={`${s.catalyst.ticker} ${s.catalyst.title} on ${s.catalyst.eventDate}: score ${s.score}, ${s.direction}, verdict ${s.verdict}.`}
          />
          <ShareButton id={s.catalyst.id} />
        </div>
      </div>

      {pastRelated.length > 0 ? (
        <section className="mt-20 border-t hairline pt-10" aria-labelledby="related-h">
          <div className="mb-5 flex items-end justify-between gap-4">
            <h2 id="related-h" className="display text-[26px] text-ink">Other {s.catalyst.ticker} cases</h2>
            <Link href={`/ticker/${s.catalyst.ticker}`} className="shrink-0 text-[15px] font-medium text-ink underline decoration-line-strong underline-offset-4 hover:decoration-ink">
              {s.catalyst.ticker}&apos;s track record →
            </Link>
          </div>
          <CaseList rows={pastRelated} showYear />
        </section>
      ) : null}
    </div>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="mb-1.5 text-[13px] text-ink-3">{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

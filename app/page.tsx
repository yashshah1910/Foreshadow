import Link from "next/link";
import { getEvent, getLeaderboard, getRadar } from "@/lib/data";
import { reactionWindowFor } from "@foreshadow/core";
import { Trace } from "@/components/event/Trace";
import { CaseList } from "@/components/cases/CaseList";
import { Legend } from "@/components/cases/Legend";
import { WindowsDiagram } from "@/components/landing/WindowsDiagram";
import { VerdictMark } from "@/components/viz/Marks";
import { caseSummary, eventName, factsFromStored, scoreWord } from "@/lib/plain";
import { fmtDate, fmtPct } from "@/lib/format";

// Live numbers on the landing: render per request.
export const dynamic = "force-dynamic";

export default async function Home() {
  const [all, radar] = await Promise.all([getLeaderboard({ limit: 500 }), getRadar(10)]);
  const exampleSummary = all.find((s) => s.verdict === "matched" && s.score >= 40) ?? all[0] ?? null;
  const example = exampleSummary ? await getEvent(exampleSummary.catalyst.id) : null;
  const unusual = all.filter((s) => s.score >= 40);
  const unusualRight = unusual.filter((s) => s.verdict === "matched").length;
  const upcoming = radar.filter((r) => r.windowOpen).slice(0, 4);

  return (
    <div className="mx-auto max-w-[1080px] px-5 sm:px-8">
      {/* ---------------- Opening ---------------- */}
      <section className="max-w-[760px] pb-16 pt-16 sm:pt-24">
        <h1 className="display text-[40px] text-ink sm:text-[56px]">
          Before big news, someone sometimes places a very big bet.
        </h1>
        <div className="prose-plain mt-7 space-y-4">
          <p>
            When a company has news coming, like an FDA decision on a drug or a quarterly earnings report, traders can
            buy <span className="term" title="Contracts that pay off if a stock moves past a certain price by a certain date. Calls pay if it rises, puts if it falls.">options</span>{" "}
            that pay off if the stock jumps or drops. Most of that betting is ordinary. But now and then, in the days just
            before the news, the bets get unusually large and lean hard one way.
          </p>
          <p>
            <strong>Foreshadow finds those moments.</strong> For every scheduled piece of news, it looks at options trading
            from <a href="https://unusualwhales.com" className="underline underline-offset-2 hover:text-ink" target="_blank" rel="noreferrer">Unusual Whales</a>{" "}
            in the five trading days before, rates how unusual it was from 0 to 100, and then checks what the stock
            actually did. Were the big bets right?
          </p>
        </div>
        <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-3 text-[15px]">
          <Link href="/leaderboard" className="pressable inline-flex h-11 items-center rounded bg-ink px-5 font-medium text-surface">
            Browse past cases
          </Link>
          <Link href="/radar" className="font-medium text-ink underline decoration-line-strong underline-offset-4 hover:decoration-ink">
            See what&apos;s coming up
          </Link>
        </div>
      </section>

      {/* ---------------- A real example ---------------- */}
      {example ? (
        <section aria-labelledby="example-h" className="border-t hairline pt-12">
          <p className="text-[14px] font-medium text-ink-3">A real example</p>
          <h2 id="example-h" className="display mt-2 text-[30px] text-ink sm:text-[36px]">
            {example.summary.catalyst.ticker}, {eventName(example.summary)}{" "}
            <span className="text-ink-3">· {fmtDate(example.summary.catalyst.eventDate, { year: true })}</span>
          </h2>
          <p className="prose-plain mt-5 max-w-[760px]">{caseSummary(example.summary, factsFromStored(example.stored))}</p>
          <div className="mt-8">
            <Trace
              bars={example.chartBars}
              daily={example.stored.breakdown.daily}
              windowDays={example.windowDays}
              eventDate={example.summary.catalyst.eventDate}
              reactionDate={example.summary.partialWindow ? null : reactionWindowFor(example.summary.catalyst.eventDate, example.summary.catalyst.session).to}
              signals={example.stored.breakdown.signals}
              rows={["flow"]}
              priceHeight={170}
              eventLabel={eventName(example.summary)}
            />
            <p className="mt-2 text-[13.5px] text-ink-3">
              Top line: the stock price. Bars: money in large options bets each day, bets on a rise above the line and bets
              on a fall below it.
            </p>
          </div>
          <dl className="mt-8 grid grid-cols-2 gap-6 border-y hairline py-5 sm:grid-cols-4">
            <Fact label="Unusual betting" value={`${example.summary.score.toFixed(0)} / 100`} note={scoreWord(example.summary.score)} />
            <Fact label="Expected move" value={`±${fmtPct(example.summary.impliedMovePct, { sign: false })}`} note="what options priced in" />
            <Fact label="Actual move" value={fmtPct(example.summary.realizedMovePct)} note="on the news" />
            <div>
              <dt className="text-[13px] text-ink-3">The bets were</dt>
              <dd className="mt-1 text-[22px]"><VerdictMark verdict={example.summary.verdict} /></dd>
            </div>
          </dl>
          <Link href={`/event/${encodeURIComponent(example.summary.catalyst.id)}`} className="mt-5 inline-block text-[15px] font-medium text-ink underline decoration-line-strong underline-offset-4 hover:decoration-ink">
            Open this case to see every trade →
          </Link>
        </section>
      ) : null}

      {/* ---------------- How it works ---------------- */}
      <section aria-labelledby="how-h" className="mt-20 border-t hairline pt-12">
        <h2 id="how-h" className="display text-[30px] text-ink sm:text-[36px]">How it works</h2>
        <ol className="mt-8 grid gap-8 md:grid-cols-3">
          <Step n="1" title="Find the scheduled news">
            FDA decisions, earnings reports, trades by members of Congress and big insider purchases, all from the Unusual
            Whales calendars.
          </Step>
          <Step n="2" title="Measure the betting before it">
            In the five trading days before the news, how much money went into options bets, how lopsided it was, and how
            that compares with the same stock&apos;s normal 60 days.
          </Step>
          <Step n="3" title="Check what happened">
            After the news, did the stock move more than options traders expected, and in the direction the bets pointed?
            If yes, the bets were right.
          </Step>
        </ol>
        <WindowsDiagram />
        {unusual.length > 0 ? (
          <p className="prose-plain mt-8 max-w-[760px]">
            So far, Foreshadow has checked <strong>{all.length} past events</strong> from the last 90 days. In{" "}
            <strong>{unusual.length}</strong> of them the betting was unusual, and in{" "}
            <strong>{unusualRight}</strong> of those the bets turned out right.
          </p>
        ) : null}
      </section>

      {/* ---------------- Cases ---------------- */}
      <section aria-labelledby="cases-h" className="mt-20 border-t hairline pt-12">
        <div className="mb-6 flex items-end justify-between gap-4">
          <h2 id="cases-h" className="display text-[30px] text-ink sm:text-[36px]">The most unusual cases lately</h2>
          <Link href="/leaderboard" className="hidden shrink-0 text-[15px] font-medium text-ink underline decoration-line-strong underline-offset-4 hover:decoration-ink sm:inline">
            All past cases →
          </Link>
        </div>
        <CaseList rows={all.slice(0, 8)} />
        <Legend />
      </section>

      {upcoming.length > 0 ? (
        <section aria-labelledby="up-h" className="mt-20 border-t hairline pt-12">
          <div className="mb-2 flex items-end justify-between gap-4">
            <h2 id="up-h" className="display text-[30px] text-ink sm:text-[36px]">Coming up</h2>
            <Link href="/radar" className="hidden shrink-0 text-[15px] font-medium text-ink underline decoration-line-strong underline-offset-4 hover:decoration-ink sm:inline">
              Everything coming up →
            </Link>
          </div>
          <p className="prose-plain mb-6 max-w-[760px]">
            News in the next two weeks where the five-day window has already started. The score fills in as the days pass.
          </p>
          <CaseList rows={upcoming} mode="live" />
        </section>
      ) : null}

      {/* ---------------- Caveats ---------------- */}
      <section aria-labelledby="note-h" className="mt-20 border-t hairline pt-12">
        <h2 id="note-h" className="display text-[30px] text-ink sm:text-[36px]">Good to know</h2>
        <ul className="prose-plain mt-6 max-w-[760px] list-disc space-y-3 pl-5">
          <li>
            <strong>Unusual isn&apos;t illegal.</strong> Big bets before news can come from good research, hedging or luck.
            Foreshadow shows what traded, never who or why.
          </li>
          <li>
            <strong>The score is plain math.</strong> The same inputs always give the same number, and every trade behind it
            is listed on the case page. Claude only writes the short summaries; it never sets a score.
          </li>
          <li>
            <strong>This isn&apos;t advice.</strong> A high score says something unusual happened. It doesn&apos;t say what will
            happen next.
          </li>
        </ul>
        <p className="mt-6 text-[14.5px] text-ink-3">
          Want the details? <Link href="/docs" className="underline underline-offset-2 hover:text-ink">Read how the score is calculated</Link>, or{" "}
          <Link href="/docs#mcp" className="underline underline-offset-2 hover:text-ink">ask Claude about any case</Link> by adding Foreshadow as a tool.
        </p>
      </section>
    </div>
  );
}

function Fact({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div>
      <dt className="text-[13px] text-ink-3">{label}</dt>
      <dd className="mt-1 font-mono text-[22px] text-ink tnum">{value}</dd>
      <dd className="text-[12.5px] text-ink-3">{note}</dd>
    </div>
  );
}

function Step({ n, title, children }: { n: string; title: string; children: React.ReactNode }) {
  return (
    <li>
      <p className="font-mono text-[14px] text-ink-3">{n}</p>
      <h3 className="mt-1 text-[17px] font-semibold text-ink">{title}</h3>
      <p className="mt-2 text-[15px] leading-relaxed text-ink-2">{children}</p>
    </li>
  );
}

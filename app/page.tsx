import Link from "next/link";
import { getEvent, getLeaderboard, getRadar, getScorecard, getStats } from "@/lib/data";
import { reactionWindowFor } from "@foreshadow/core";
import { Trace } from "@/components/event/Trace";
import { CaseList } from "@/components/cases/CaseList";
import { Legend } from "@/components/cases/Legend";
import { WindowsDiagram } from "@/components/landing/WindowsDiagram";
import { VerdictMark } from "@/components/viz/Marks";
import { eventName, eventPhrase, scorecardFinding, scoreWord } from "@/lib/plain";
import { fmtDate, fmtPct, KIND_LABELS } from "@/lib/format";

// Live numbers on the landing: render per request.
export const dynamic = "force-dynamic";

export default async function Home() {
  const [all, radar, stats, scorecard] = await Promise.all([getLeaderboard({ limit: 40 }), getRadar(10), getStats(), getScorecard()]);
  const exampleSummary = all.find((s) => s.verdict === "matched" && s.score >= 40) ?? all[0] ?? null;
  const example = exampleSummary ? await getEvent(exampleSummary.catalyst.id) : null;
  const { checked, unusual, unusualRight } = stats.past;
  const upcoming = radar.filter((r) => r.windowOpen).slice(0, 4);

  return (
    <div className="mx-auto max-w-[1120px] px-5 sm:px-8">
      {/* ---------------- Opening ---------------- */}
      <section className="grid grid-cols-[minmax(0,1fr)] items-center gap-12 pb-8 pt-12 sm:pt-20 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:gap-14">
        <div className="min-w-0">
          <h1 className="display text-[44px] text-ink sm:text-[64px]">Spot the big bets placed days before the news.</h1>
          <div className="prose-plain mt-7 space-y-4 text-[18px]">
            <p>
              Before an FDA decision or an earnings report, some traders pile into{" "}
              <span className="term" title="Contracts that pay off if a stock moves past a certain price by a certain date. Calls pay if it rises, puts if it falls.">options</span>{" "}
              that only pay off if the stock jumps, or only if it drops.
            </p>
            <p>
              Foreshadow rates how unusual that betting was, from 0 to 100, using trade data from{" "}
              <a href="https://unusualwhales.com" className="link" target="_blank" rel="noreferrer">Unusual Whales</a>. Then it
              checks what the stock actually did.
            </p>
          </div>
          <div className="mt-9 flex flex-wrap items-center gap-3">
            <Link href="/leaderboard" className="pressable btn btn-primary">Browse past cases</Link>
            <Link href="/radar" className="pressable btn btn-soft">See what&apos;s coming up</Link>
          </div>
        </div>

        {example ? (
          <figure className="tray min-w-0 p-2">
            <div className="px-4 pb-3 pt-4 sm:px-5">
              <figcaption className="text-[14px] font-medium text-ink-3">A real case</figcaption>
              <p className="mt-1.5 text-[20px] font-semibold leading-snug text-ink">
                <span className="ticker">{example.summary.catalyst.ticker}</span> {eventName(example.summary)}
              </p>
              <p className="mt-0.5 text-[14.5px] text-ink-3">{fmtDate(example.summary.catalyst.eventDate, { year: true })}</p>
            </div>
            <div className="card px-4 pb-2 pt-5 sm:px-5">
              <Trace
                bars={example.chartBars}
                daily={example.stored.breakdown.daily}
                windowDays={example.windowDays}
                eventDate={example.summary.catalyst.eventDate}
                reactionDate={example.summary.partialWindow ? null : reactionWindowFor(example.summary.catalyst.eventDate, example.summary.catalyst.session).to}
                signals={example.stored.breakdown.signals}
                rows={["flow"]}
                priceHeight={130}
                eventLabel={eventPhrase(example.summary)}
                replay
              />
            </div>
            <dl className="mt-1.5 grid grid-cols-2 gap-1.5 sm:grid-cols-3">
              <Fact label="Unusual betting" value={`${example.summary.score.toFixed(0)}`} note={`of 100, ${scoreWord(example.summary.score).toLowerCase()}`} />
              <Fact
                label="Move on the news"
                value={fmtPct(example.summary.realizedMovePct)}
                note={`expected ±${fmtPct(example.summary.impliedMovePct, { sign: false, decimals: 0 })}`}
              />
              <div className="card col-span-2 px-4 py-3.5 sm:col-span-1">
                <dt className="text-[13px] font-medium text-ink-3">The bets were</dt>
                <dd className="mt-2"><VerdictMark verdict={example.summary.verdict} /></dd>
              </div>
            </dl>
            <Link
              href={`/event/${encodeURIComponent(example.summary.catalyst.id)}`}
              className="mt-1.5 flex items-center justify-between rounded-[14px] px-5 py-3.5 text-[15px] font-semibold text-ink transition-colors hover:bg-surface-3"
            >
              Open this case and see every trade
              <span aria-hidden="true">↗</span>
            </Link>
          </figure>
        ) : null}
      </section>

      {/* ---------------- How it works ---------------- */}
      <section aria-labelledby="how-h" className="mt-28">
        <h2 id="how-h" className="display text-[34px] text-ink sm:text-[42px]">How it works</h2>
        <ol className="mt-10 grid gap-10 md:grid-cols-3 md:gap-8">
          <Step n="1" title="Find the scheduled news">
            FDA decisions, earnings reports, trades by members of Congress and big insider purchases, all from the Unusual
            Whales calendars.
          </Step>
          <Step n="2" title="Measure the betting before it">
            In the five trading days before the news: how much money went into options bets, how lopsided it was, and how
            that compares with the same stock&apos;s normal 60 days.
          </Step>
          <Step n="3" title="Check what happened">
            After the news, did the stock move more than options traders expected, and in the direction the bets pointed? If
            yes, the bets were right.
          </Step>
        </ol>
        <WindowsDiagram />
        {unusual > 0 ? (
          <p className="prose-plain mt-10 max-w-[720px] text-[18px]">
            So far Foreshadow has checked <strong>{checked.toLocaleString("en-US")} past events</strong> from the last 90 days.
            The betting was unusual before <strong>{unusual}</strong> of them, and in <strong>{unusualRight}</strong> of those the bets
            turned out right.
          </p>
        ) : null}
      </section>

      {/* ---------------- Proof ---------------- */}
      {scorecard.cases > 0 ? (
        <section aria-labelledby="proof-h" className="mt-28">
          <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
            <h2 id="proof-h" className="display text-[34px] text-ink sm:text-[42px]">Does it know something?</h2>
            <Link href="/scorecard" className="pressable btn btn-soft h-10 text-[14.5px]">See the scorecard</Link>
          </div>
          <p className="prose-plain mb-7 max-w-[720px]">
            Foreshadow grades itself in public. Across {scorecard.cases.toLocaleString("en-US")} finished cases, here is how
            often unusual betting turned out right compared with ordinary betting.
          </p>
          <div className="grid gap-2 md:grid-cols-2">
            {scorecard.kinds.map((k) => (
              <div key={k.kind} className="tray p-6">
                <p className="text-[14px] font-medium text-ink-3">{KIND_LABELS[k.kind] ?? k.kind}</p>
                <p className="mt-2 text-[19px] font-semibold leading-snug text-ink">{scorecardFinding(k.kind, k.bands)}</p>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {/* ---------------- Cases ---------------- */}
      <section aria-labelledby="cases-h" className="mt-28">
        <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
          <h2 id="cases-h" className="display text-[34px] text-ink sm:text-[42px]">The most unusual cases lately</h2>
          <Link href="/leaderboard" className="pressable btn btn-soft h-10 text-[14.5px]">All past cases</Link>
        </div>
        <CaseList rows={all.slice(0, 8)} />
        <Legend />
      </section>

      {upcoming.length > 0 ? (
        <section aria-labelledby="up-h" className="mt-28">
          <div className="mb-3 flex flex-wrap items-end justify-between gap-4">
            <h2 id="up-h" className="display text-[34px] text-ink sm:text-[42px]">Coming up</h2>
            <Link href="/radar" className="pressable btn btn-soft h-10 text-[14.5px]">Everything coming up</Link>
          </div>
          <p className="prose-plain mb-7 max-w-[720px]">
            News due in the next two weeks where the five-day count has already started. The score fills in day by day.
          </p>
          <CaseList rows={upcoming} mode="live" />
        </section>
      ) : null}

      {/* ---------------- Caveats ---------------- */}
      <section aria-labelledby="note-h" className="mt-28">
        <h2 id="note-h" className="display text-[34px] text-ink sm:text-[42px]">Good to know</h2>
        <div className="mt-8 grid gap-1.5 md:grid-cols-3">
          <Note title="Unusual isn't illegal">
            Big bets before news can come from good research, hedging or luck. Foreshadow shows what traded, never who placed
            it or why.
          </Note>
          <Note title="The score is plain math">
            The same inputs always give the same number, and every trade behind it is listed on the case page. Claude writes
            the short summaries and never sets a score.
          </Note>
          <Note title="This isn't advice">
            A high score says something unusual happened before the news. It says nothing about what a stock will do next.
          </Note>
        </div>
        <p className="mt-6 text-[16px] text-ink-2">
          Want the details? <Link href="/docs" className="link">Read how the score is calculated</Link>, or{" "}
          <Link href="/docs#mcp" className="link">ask Claude about any case</Link> by adding Foreshadow as a tool.
        </p>
      </section>
    </div>
  );
}

function Fact({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="card px-4 py-3.5">
      <dt className="text-[13px] font-medium text-ink-3">{label}</dt>
      <dd className="numeral mt-2 text-[24px] text-ink">{value}</dd>
      <dd className="mt-1 text-[13px] text-ink-3">{note}</dd>
    </div>
  );
}

function Step({ n, title, children }: { n: string; title: string; children: React.ReactNode }) {
  return (
    <li>
      <span className="grid h-9 w-9 place-items-center rounded-full bg-hl text-[15px] font-bold text-ink" aria-hidden="true">
        {n}
      </span>
      <h3 className="mt-4 text-[19px] font-semibold text-ink">{title}</h3>
      <p className="mt-2 text-[16px] leading-relaxed text-ink-2">{children}</p>
    </li>
  );
}

function Note({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="tray rounded-[18px] p-6">
      <h3 className="text-[17px] font-semibold text-ink">{title}</h3>
      <p className="mt-2 text-[15.5px] leading-relaxed text-ink-2">{children}</p>
    </div>
  );
}

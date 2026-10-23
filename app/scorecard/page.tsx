import type { Metadata } from "next";
import Link from "next/link";
import { getLeaderboard, getScorecard } from "@/lib/data";
import { CaseList } from "@/components/cases/CaseList";
import { FindingBars, findingRates } from "@/components/viz/FindingBars";
import { AskPanel } from "@/components/event/AskPanel";
import type { Scorecard, ScorecardBand } from "@/lib/data";
import { KIND_LABELS } from "@/lib/format";
import { kindsLiftFirst, SCORECARD_MIN_CASES as MIN_CASES, scorecardFinding } from "@/lib/plain";

export const metadata: Metadata = {
  title: "Scorecard",
  description:
    "Does unusual options betting before company news actually know something? Every finished case Foreshadow has scored, and how often the bets were right.",
};

const BAND_WORD: Record<number, string> = { 0: "Ordinary", 20: "A little unusual", 40: "Unusual", 70: "Very unusual" };

export default async function ScorecardPage() {
  const [card, rightCalls] = await Promise.all([
    getScorecard().then((c) => ({ ...c, kinds: kindsLiftFirst(c.kinds) })),
    getLeaderboard({ minScore: 40, matchedOnly: true, limit: 60 }),
  ]);
  const allBands = card.kinds.flatMap((k) => k.bands);
  const beatShare = card.cases > 0 ? Math.round((allBands.reduce((n, b) => n + b.movedMore, 0) / card.cases) * 100) : null;
  const biggest = [...rightCalls].sort((a, b) => Math.abs(b.realizedMovePct ?? 0) - Math.abs(a.realizedMovePct ?? 0)).slice(0, 6);
  const maxPct = Math.max(...card.kinds.flatMap((k) => k.bands.filter((b) => b.cases >= 3).map((b) => pct(b.right, b.leaned))), 0);
  const scaleMax = Math.max(30, Math.ceil(maxPct / 10) * 10);

  return (
    <div className="mx-auto max-w-[1120px] px-5 py-12 sm:px-8 lg:py-16">
      <header className="max-w-[760px]">
        <h1 className="display text-[44px] text-ink sm:text-[60px]">Scorecard</h1>
        <p className="prose-plain mt-5">
          Does unusual betting before the news actually know something? Here is every finished case Foreshadow has
          scored, <strong>{card.cases.toLocaleString("en-US")}</strong> so far, grouped by how unusual the betting was. Nothing is
          picked by hand, and the numbers update as new cases finish. FDA cases go back a year; earnings cases cover the last
          few months, and a full year for some of the largest companies.
        </p>
      </header>

      <section aria-labelledby="findings-h" className="mt-12 grid gap-2 md:grid-cols-2">
        <h2 id="findings-h" className="sr-only">What the cases show</h2>
        {card.kinds.map((k) => (
          <div key={k.kind} className="tray p-6">
            <p className="text-[14px] font-medium text-ink-3">{KIND_LABELS[k.kind] ?? k.kind}</p>
            <p className="mt-2 text-[19px] font-semibold leading-snug text-ink">{scorecardFinding(k.kind, k.bands)}</p>
            <FindingBars bands={k.bands} scaleMax={Math.max(10, ...card.kinds.flatMap((x) => findingRates(x.bands)))} />
          </div>
        ))}
      </section>

      <section aria-labelledby="bands-h" className="mt-20">
        <h2 id="bands-h" className="display text-[34px] text-ink">How often the bets were right</h2>
        <p className="mt-3 max-w-[720px] text-[16px] leading-relaxed text-ink-2">
          The bets count as right when the stock moved at least as much as options traders expected, in the direction the
          bets leaned. That is a high bar: options prices already include the expected move, so most bets miss it. Cases where
          the bets didn&apos;t lean either way can&apos;t be right, so they are left out of this rate.
        </p>
        {beatShare !== null ? (
          <p className="tray mt-5 max-w-[720px] px-5 py-4 text-[15.5px] leading-relaxed text-ink-2">
            <strong className="font-semibold text-ink">Why most cases aren&apos;t &ldquo;right&rdquo;:</strong> across all{" "}
            {card.cases.toLocaleString("en-US")} cases, the stock beat its expected move only {beatShare}% of the time, in
            either direction. Pick a direction at random and you&apos;d be right about half of that, roughly {Math.round(beatShare / 2)}%
            of the time. That&apos;s the yardstick; on case pages, &ldquo;Right way&rdquo; marks the cases that moved the way the bets
            leaned but by less than expected.
          </p>
        ) : null}
        <div className="mt-8 grid gap-2 lg:grid-cols-2">
          {card.kinds.map((k) => (
            <figure key={k.kind} className="tray p-2">
              <figcaption className="flex items-baseline justify-between px-4 pb-3 pt-4">
                <span className="text-[18px] font-semibold text-ink">{KIND_LABELS[k.kind] ?? k.kind}</span>
                <span className="text-[14px] text-ink-3 tnum">{k.cases.toLocaleString("en-US")} cases</span>
              </figcaption>
              <ol className="grid gap-1.5">
                {k.bands.map((b) => (
                  <BandRow key={b.min} band={b} scaleMax={scaleMax} />
                ))}
              </ol>
            </figure>
          ))}
        </div>
        <p className="mt-3 px-1 text-[14px] text-ink-3">
          Bars share one scale, 0 to {scaleMax}%. Rows marked &ldquo;few cases&rdquo; have under {MIN_CASES}: too few to read much into.
        </p>
      </section>

      {biggest.length > 0 ? (
        <section aria-labelledby="right-h" className="mt-20">
          <h2 id="right-h" className="display text-[34px] text-ink">When unusual betting was right</h2>
          <p className="mt-3 mb-7 max-w-[720px] text-[16px] leading-relaxed text-ink-2">
            The cases behind the numbers: betting scored 40 or more, and the stock then moved more than expected in the
            direction the bets leaned. Biggest moves first.
          </p>
          <CaseList rows={biggest} showYear />
        </section>
      ) : null}

      <section aria-labelledby="table-h" className="mt-20">
        <h2 id="table-h" className="display text-[28px] text-ink">All the numbers</h2>
        <p className="mt-2 max-w-[720px] text-[15.5px] leading-relaxed text-ink-2">
          Two looser checks sit beside &ldquo;right&rdquo;: whether the stock moved more than expected in either direction, and
          whether it moved the way the bets leaned at all.
        </p>
        <NumbersTable card={card} />
      </section>

      <div className="mt-16 max-w-[760px]">
        <AskPanel
          scope="scorecard"
          summary={`The reader is on the Scorecard: ${card.cases} finished cases. ${card.kinds.map((k) => scorecardFinding(k.kind, k.bands)).join(" ")}`.slice(0, 600)}
        />
      </div>

      <p className="mt-16 text-[16px] text-ink-2">
        Think you can read the bets better? <Link href="/guess" className="link">Play Guess the move</Link>: five real cases, the
        result hidden.
      </p>

      <section className="mt-6 grid gap-2 md:grid-cols-3">
        <Note title="Why ordinary betting is the yardstick">
          The &ldquo;ordinary&rdquo; row shows how often bets turn out right when nothing unusual happened. Unusual betting only
          means something if it beats that.
        </Note>
        <Note title="What this can't tell you">
          Who placed the bets or why. A good record can come from skill, research or luck, and none of it is advice about
          what to trade.
        </Note>
        <Note title="Check any case">
          Every number here comes from the cases in <Link href="/leaderboard" className="link">Past cases</Link>, each with its
          trades, its score&apos;s arithmetic and what the stock did.
        </Note>
      </section>
    </div>
  );
}

function BandRow({ band, scaleMax }: { band: ScorecardBand; scaleMax: number }) {
  const p = pct(band.right, band.leaned);
  const thin = band.cases < MIN_CASES;
  const width = band.cases ? Math.max(1.5, (p / scaleMax) * 100) : 0;
  const tip = band.cases
    ? `${band.label}: the bets were right in ${band.right} of the ${band.leaned} cases where they leaned (${p.toFixed(0)}%)`
    : `${band.label}: no finished cases yet`;
  return (
    <li title={tip} className="card grid grid-cols-[8.5rem_minmax(0,1fr)] items-center gap-4 px-4 py-3.5 sm:grid-cols-[10rem_minmax(0,1fr)]">
      <span className="min-w-0">
        <span className="block text-[15px] font-medium text-ink">{BAND_WORD[band.min]}</span>
        <span className="block text-[13px] text-ink-3">score {band.label}</span>
      </span>
      <span className="min-w-0">
        {band.cases ? (
          <>
            <span className="block h-2.5 rounded-full bg-surface-2" aria-hidden="true">
              <span className={`block h-full rounded-full ${thin ? "bg-surface-3" : band.min >= 40 ? "bg-ink" : "bg-ink-3"}`} style={{ width: `${width}%` }} />
            </span>
            <span className="mt-1.5 block text-[14px] text-ink-2 tnum">
              <span className="font-semibold text-ink">{p.toFixed(0)}% right</span>, {band.right} of {band.leaned} that leaned
              {thin ? <span className="ml-2 rounded-full bg-surface-2 px-2 py-0.5 text-[12px] font-medium text-ink-2">few cases</span> : null}
            </span>
          </>
        ) : (
          <span className="text-[14px] text-ink-3">No cases yet</span>
        )}
      </span>
    </li>
  );
}

function NumbersTable({ card }: { card: Scorecard }) {
  return (
    <div className="tray mt-6 overflow-x-auto p-2">
      <table className="w-full min-w-[640px] border-separate border-spacing-y-1 text-[14.5px]">
        <thead className="text-left text-[13px] text-ink-3">
          <tr>
            <th className="px-3 py-2 font-medium">News</th>
            <th className="px-3 py-2 font-medium">Score</th>
            <th className="px-3 py-2 text-right font-medium">Cases</th>
            <th className="px-3 py-2 text-right font-medium">Bets right</th>
            <th className="px-3 py-2 text-right font-medium">Moved more than expected</th>
            <th className="px-3 py-2 text-right font-medium">Moved the way bets leaned</th>
          </tr>
        </thead>
        <tbody>
          {card.kinds.flatMap((k) =>
            k.bands.map((b) => (
              <tr key={`${k.kind}-${b.min}`} className="bg-surface tnum [&>td:first-child]:rounded-l-xl [&>td:last-child]:rounded-r-xl">
                <td className="px-3 py-2.5 text-ink">{KIND_LABELS[k.kind] ?? k.kind}</td>
                <td className="px-3 py-2.5 text-ink-2">{b.label}</td>
                <td className="px-3 py-2.5 text-right text-ink-2">{b.cases}</td>
                <td className="px-3 py-2.5 text-right font-semibold text-ink">{share(b.right, b.leaned)}</td>
                <td className="px-3 py-2.5 text-right text-ink-2">{share(b.movedMore, b.cases)}</td>
                <td className="px-3 py-2.5 text-right text-ink-2">{share(b.leanedRight, b.leaned)}</td>
              </tr>
            )),
          )}
        </tbody>
      </table>
    </div>
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

function pct(n: number, d: number): number {
  return d > 0 ? (n / d) * 100 : 0;
}

function share(n: number, d: number): string {
  return d > 0 ? `${pct(n, d).toFixed(0)}%` : "—";
}

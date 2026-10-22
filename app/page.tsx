import Link from "next/link";
import { getEvent, getLeaderboard, getRadar, getStats } from "@/lib/data";
import { reactionWindowFor } from "@foreshadow/core";
import { Trace } from "@/components/event/Trace";
import { CaseList } from "@/components/cases/CaseList";
import { Highlight } from "@/components/viz/Highlight";
import { MoveGauge } from "@/components/viz/MoveGauge";
import { DirectionMark, KindTag, ScoreFigure, VerdictMark, bandName } from "@/components/viz/Marks";
import { CopyCommand } from "@/components/landing/CopyCommand";
import { WindowsDiagram } from "@/components/landing/WindowsDiagram";
import { env } from "@/lib/env";
import { fmtDate, fmtExpiry, fmtMoney, fmtPct, fmtStrike, KIND_LABELS } from "@/lib/format";

// Live numbers on the landing: render per request.
export const dynamic = "force-dynamic";

export default async function Home() {
  const [stats, all, radar] = await Promise.all([getStats(), getLeaderboard({ limit: 500 }), getRadar(10)]);
  const top = all.slice(0, 6);
  const heroId = stats.heroCatalystId ?? top[0]?.catalyst.id ?? null;
  const hero = heroId ? await getEvent(heroId) : null;
  const strong = all.filter((t) => t.score >= 70);
  const strongMatched = strong.filter((t) => t.verdict === "matched").length;
  const matchedPct = strong.length ? Math.round((strongMatched / strong.length) * 100) : 0;
  const building = radar.filter((r) => r.windowOpen).slice(0, 3);
  const example = hero ? exampleAnswer(hero) : null;
  const base = env.siteUrl.replace(/\/$/, "");

  return (
    <div className="mx-auto max-w-[1200px] px-4 sm:px-6">
      {/* ---------------- Hero ---------------- */}
      <section className="grid gap-8 pb-10 pt-12 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:items-end lg:gap-14 lg:pb-14 lg:pt-20">
        <div>
          <p className="label mb-5">Options-flow forensics · built on Unusual Whales</p>
          <h1 className="display text-[56px] sm:text-[80px] lg:text-[104px]">
            Someone <Highlight draw delay={350}>knew.</Highlight>
            <br />
            <span className="text-ink-3">Prove it.</span>
          </h1>
        </div>
        <div className="lg:pb-3">
          <p className="text-[16.5px] leading-relaxed text-ink-2">
            Foreshadow scores every FDA decision, earnings report, congress trade and insider filing by the options
            footprint it left in the five sessions before the news, then checks that footprint against the move.
          </p>
          <div className="mt-6 flex flex-wrap gap-2.5">
            <Link href="/leaderboard" className="pressable inline-flex h-10 items-center rounded-md bg-ink px-4 text-[14px] font-medium text-surface">
              Open the leaderboard
            </Link>
            <Link href="/radar" className="pressable inline-flex h-10 items-center rounded-md border border-line-strong bg-surface px-4 text-[14px] text-ink hover:bg-surface-2">
              What&apos;s building now
            </Link>
          </div>
          <div className="mt-5">
            <p className="mb-1.5 text-[12px] text-ink-3">Or ask Claude: add Foreshadow as an MCP server</p>
            <CopyCommand command={`claude mcp add --transport http foreshadow ${base}/api/mcp`} />
          </div>
        </div>
      </section>

      {/* ---------------- Exhibit A ---------------- */}
      {hero ? (
        <section aria-labelledby="exhibit-h" className="sheet overflow-hidden">
          <header className="flex flex-wrap items-start gap-x-8 gap-y-4 border-b hairline px-5 py-4 sm:px-6">
            <div className="min-w-0 flex-1">
              <p className="label mb-2">Exhibit A</p>
              <h2 id="exhibit-h" className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <span className="font-mono text-[22px] font-semibold text-ink">{hero.summary.catalyst.ticker}</span>
                <span className="display text-[22px] sm:text-[26px]">{hero.summary.catalyst.title}</span>
              </h2>
              <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-ink-3">
                <KindTag kind={hero.summary.catalyst.kind} />
                <span className="tnum">{fmtDate(hero.summary.catalyst.eventDate, { year: true, weekday: true })}</span>
                {hero.summary.company ? <span>{hero.summary.company.name}</span> : null}
              </p>
            </div>
            <div className="flex items-end gap-4">
              <div className="text-right">
                <ScoreFigure score={hero.summary.score} size="lg" draw />
                <p className="mt-1 text-[12px] text-ink-3">{bandName(hero.summary.score)} · of 100</p>
              </div>
            </div>
          </header>
          <div className="px-3 pb-2 pt-4 sm:px-6">
            <Trace
              bars={hero.chartBars}
              daily={hero.stored.breakdown.daily}
              windowDays={hero.windowDays}
              eventDate={hero.summary.catalyst.eventDate}
              reactionDate={hero.summary.partialWindow ? null : reactionWindowFor(hero.summary.catalyst.eventDate, hero.summary.catalyst.session).to}
              signals={hero.stored.breakdown.signals}
              rows={["flow", "oi"]}
              priceHeight={150}
              eventLabel={hero.summary.catalyst.title}
            />
          </div>
          <footer className="flex flex-wrap items-center gap-x-8 gap-y-3 border-t hairline bg-surface-2 px-5 py-3.5 sm:px-6">
            <DirectionMark direction={hero.summary.direction} />
            <span className="flex items-center gap-3 text-[13px] text-ink-2">
              <MoveGauge implied={hero.summary.impliedMovePct} realized={hero.summary.realizedMovePct} width={120} />
              <span className="font-mono tnum">
                implied ±{fmtPct(hero.summary.impliedMovePct, { sign: false })} · moved <span className="text-ink">{fmtPct(hero.summary.realizedMovePct)}</span>
              </span>
            </span>
            <VerdictMark verdict={hero.summary.verdict} />
            <Link href={`/event/${encodeURIComponent(hero.summary.catalyst.id)}`} className="pressable ml-auto text-[13px] font-medium text-ink underline decoration-line-strong underline-offset-4 hover:decoration-ink">
              Open the full case →
            </Link>
          </footer>
        </section>
      ) : null}

      {/* ---------------- The numbers ---------------- */}
      <section aria-label="Track record" className="grid gap-px overflow-hidden rounded-[10px] border hairline bg-line sm:grid-cols-3 mt-6">
        {[
          { n: String(all.length), l: "past catalysts ranked in the last 90 days" },
          { n: String(strong.length), l: "left a 70+ footprint before the news" },
          { n: `${matchedPct}%`, l: "of those footprints matched the move", hl: true },
        ].map((s) => (
          <div key={s.l} className="bg-surface px-6 py-5">
            <p className="numeral text-[52px] tnum">{s.hl ? <Highlight>{s.n}</Highlight> : s.n}</p>
            <p className="mt-2 text-[13px] text-ink-2">{s.l}</p>
          </div>
        ))}
      </section>

      {/* ---------------- Case log ---------------- */}
      <section className="mt-20" aria-labelledby="log-h">
        <div className="mb-4 flex items-end justify-between gap-4">
          <div>
            <p className="label mb-2">Case log · last 90 days</p>
            <h2 id="log-h" className="display text-[30px] sm:text-[36px]">Where the footprint came first</h2>
          </div>
          <Link href="/leaderboard" className="pressable hidden shrink-0 text-[13px] font-medium text-ink underline decoration-line-strong underline-offset-4 hover:decoration-ink sm:inline">
            Full leaderboard →
          </Link>
        </div>
        <CaseList rows={top} />
      </section>

      {/* ---------------- Building now ---------------- */}
      {building.length > 0 ? (
        <section className="mt-20" aria-labelledby="live-h">
          <div className="mb-4 flex items-end justify-between gap-4">
            <div>
              <p className="label mb-2">Live Radar · next 10 sessions</p>
              <h2 id="live-h" className="display text-[30px] sm:text-[36px]">Building right now</h2>
            </div>
            <Link href="/radar" className="pressable hidden shrink-0 text-[13px] font-medium text-ink underline decoration-line-strong underline-offset-4 hover:decoration-ink sm:inline">
              Open the radar →
            </Link>
          </div>
          <CaseList rows={building} mode="live" />
        </section>
      ) : null}

      {/* ---------------- How a score is built ---------------- */}
      <section className="mt-20" aria-labelledby="how-h">
        <p className="label mb-2">Method</p>
        <h2 id="how-h" className="display mb-4 text-[30px] sm:text-[36px]">One axis, three windows</h2>
        <WindowsDiagram />
      </section>

      {/* ---------------- Claude ---------------- */}
      <section className="mt-20 grid gap-4 md:grid-cols-2" aria-labelledby="claude-h">
        <div className="sheet p-6">
          <p className="label mb-2">MCP · both directions</p>
          <h2 id="claude-h" className="display text-[26px]">Ask it in plain English</h2>
          <p className="mt-3 text-[14px] leading-relaxed text-ink-2">
            Foreshadow is a remote MCP server with three tools: <code className="font-mono text-ink">foreshadow_score</code>,{" "}
            <code className="font-mono text-ink">foreshadow_radar</code> and <code className="font-mono text-ink">foreshadow_history</code>. The in-app
            investigator goes the other way and calls the Unusual Whales MCP for raw flow.
          </p>
          {example ? (
            <div className="mt-5 rounded-md border hairline bg-surface-2 p-4 text-[13.5px]">
              <p className="text-ink-3">You</p>
              <p className="mt-0.5 text-ink">{example.question}</p>
              <p className="mt-3 text-ink-3">Claude · used foreshadow_score</p>
              <p className="mt-0.5 leading-relaxed text-ink-2">{example.answer}</p>
            </div>
          ) : null}
        </div>
        <div className="sheet p-6">
          <p className="label mb-2">Claude writes, never computes</p>
          <h2 className="display text-[26px]">Every number is checked</h2>
          <p className="mt-3 text-[14px] leading-relaxed text-ink-2">
            The score is a pure function: no model touches the arithmetic. Claude only turns the breakdown into a
            three-sentence story and a caption, and every figure it writes is matched against the input rows before it
            ships. The rows sit beside the story so anyone can verify it.
          </p>
          <ul className="mt-5 space-y-2.5 text-[13.5px] text-ink-2">
            {[
              "Deterministic scorer with regression tests",
              "Narrations cached by ticker, date and score",
              "Works without an Anthropic key: template text instead",
              "Bring your own UW key, stored in Supabase Vault",
            ].map((t) => (
              <li key={t} className="flex gap-2.5">
                <span className="mt-[7px] h-1.5 w-2.5 shrink-0 -skew-x-12 bg-hl" aria-hidden="true" />
                {t}
              </li>
            ))}
          </ul>
        </div>
      </section>
    </div>
  );
}

function exampleAnswer(ev: NonNullable<Awaited<ReturnType<typeof getEvent>>>) {
  const s = ev.summary;
  const alerts = ev.footprint.flatMap((d) => d.alerts);
  const total = alerts.reduce((a, x) => a + x.premium, 0);
  const puts = alerts.filter((x) => x.type === "put").reduce((a, x) => a + x.premium, 0);
  const top = ev.stored.breakdown.topAlerts[0];
  const kind = KIND_LABELS[s.catalyst.kind] ?? s.catalyst.kind;
  const lead = top
    ? `, led by ${fmtMoney(top.premium, { decimals: 1 })} of ${fmtExpiry(top.expiry)} ${fmtStrike(top.strike)} ${top.type}s`
    : "";
  const move =
    s.realizedMovePct === null
      ? ""
      : ` The stock moved ${fmtPct(s.realizedMovePct)} against a ±${fmtPct(s.impliedMovePct, { sign: false })} implied move.`;
  return {
    question: `Did anyone know about ${s.catalyst.ticker} before ${fmtDate(s.catalyst.eventDate)}?`,
    answer: `Score ${s.score.toFixed(0)}, ${s.direction}. ${fmtMoney(total, { decimals: 1 })} of flow-alert premium in the five sessions before the ${kind} catalyst, ${total ? Math.round((puts / total) * 100) : 0}% of it in puts${lead}.${move}`,
  };
}

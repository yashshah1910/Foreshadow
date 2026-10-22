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
import { MoveGauge } from "@/components/viz/MoveGauge";
import { DirectionMark, KindTag, ScoreFigure, VerdictMark, WindowMeter, bandName } from "@/components/viz/Marks";
import { fmtDate, fmtPct, KIND_LABELS } from "@/lib/format";

export async function generateMetadata({ params }: PageProps<"/event/[id]">): Promise<Metadata> {
  const { id } = await params;
  const ev = await getEvent(decodeURIComponent(id));
  if (!ev) return { title: "Case not found" };
  const s = ev.summary;
  const title = `${s.catalyst.ticker} · ${s.catalyst.title} · score ${s.score.toFixed(0)}`;
  const description = `${s.direction} footprint before the ${KIND_LABELS[s.catalyst.kind]} catalyst on ${fmtDate(s.catalyst.eventDate, { year: true })}. Implied ±${fmtPct(s.impliedMovePct, { sign: false })}, moved ${fmtPct(s.realizedMovePct)}: ${s.verdict}.`;
  return { title, description, openGraph: { title, description }, twitter: { title, description } };
}

export default async function EventPage({ params }: PageProps<"/event/[id]">) {
  const { id } = await params;
  const [ev, today] = await Promise.all([getEvent(decodeURIComponent(id)), getToday()]);
  if (!ev) notFound();
  const { summary: s, stored, footprint, windowDays, chartBars, related } = ev;
  const alerts = footprint.flatMap((d) => d.alerts);
  const rw = reactionWindowFor(s.catalyst.eventDate, s.catalyst.session);
  const session =
    s.catalyst.session === "premarket"
      ? "before the open"
      : s.catalyst.session === "afterhours"
        ? "after the close"
        : s.catalyst.session === "intraday"
          ? "during the session"
          : null;
  const pastRelated = related.filter((r) => r.catalyst.eventDate <= today).slice(0, 6);

  return (
    <div className="mx-auto max-w-[1200px] px-4 py-8 sm:px-6 lg:py-10">
      <nav className="mb-8 flex items-center gap-2 text-[12.5px] text-ink-3" aria-label="Breadcrumb">
        <Link href="/leaderboard" className="hover:text-ink">Leaderboard</Link>
        <span aria-hidden="true">/</span>
        <Link href={`/ticker/${s.catalyst.ticker}`} className="font-mono hover:text-ink">{s.catalyst.ticker}</Link>
        <span aria-hidden="true">/</span>
        <span className="text-ink-2 tnum">{fmtDate(s.catalyst.eventDate, { year: true })}</span>
      </nav>

      {/* ---------------- Case header ---------------- */}
      <header className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
        <div className="min-w-0">
          <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-2 text-[13px] text-ink-2">
            <KindTag kind={s.catalyst.kind} />
            <span className="tnum">
              {fmtDate(s.catalyst.eventDate, { year: true, weekday: true })}
              {session ? `, ${session}` : ""}
            </span>
            {s.partialWindow ? (
              <span className="inline-flex items-center gap-2 text-ink">
                <WindowMeter elapsed={stored.flags.footprintDaysUsed} total={5} />
                Live · {stored.flags.footprintDaysUsed} of 5 sessions in
              </span>
            ) : null}
          </div>
          <h1>
            <span className="block font-mono text-[44px] font-semibold leading-none tracking-tight text-ink sm:text-[56px]">{s.catalyst.ticker}</span>
            <span className="display mt-3 block text-[30px] sm:text-[42px]">{s.catalyst.title}</span>
          </h1>
          {s.company ? (
            <p className="mt-3 text-[14px] text-ink-2">
              {s.company.name}
              {s.company.sector ? ` · ${s.company.sector}` : ""}
            </p>
          ) : null}
        </div>
        <div className="flex items-end gap-6 lg:flex-col lg:items-end lg:gap-3">
          <div className="lg:text-right">
            <ScoreFigure score={s.score} size="xl" draw />
            <p className="mt-2 text-[13px] text-ink-2">
              <span className="font-medium text-ink">{bandName(s.score)}</span> · Foreshadow score of 100
            </p>
          </div>
        </div>
      </header>

      {/* ---------------- Verdict bar ---------------- */}
      <section aria-label="Verdict" className="sheet mt-8 grid grid-cols-2 divide-line md:grid-cols-[repeat(4,minmax(0,1fr))_auto] md:divide-x">
        <Stat label="Positioning">
          <DirectionMark direction={s.direction} />
        </Stat>
        <Stat label="Implied move">
          <span className="font-mono text-[18px] text-ink tnum">±{fmtPct(s.impliedMovePct, { sign: false })}</span>
        </Stat>
        <Stat label={s.partialWindow ? "Realized move" : `Moved, ${rw.reactionWindow === "T" ? "on the day" : "next session"}`}>
          <span className="flex items-center gap-3">
            <span className="font-mono text-[18px] text-ink tnum">{s.verdict === "pending" ? "pending" : fmtPct(s.realizedMovePct)}</span>
            <MoveGauge implied={s.impliedMovePct} realized={s.verdict === "pending" ? null : s.realizedMovePct} width={92} />
          </span>
        </Stat>
        <Stat label="Verdict">
          <VerdictMark verdict={s.verdict} />
        </Stat>
        <div className="col-span-2 flex items-center border-t hairline px-5 py-4 md:col-span-1 md:border-t-0">
          <ShareButton id={s.catalyst.id} />
        </div>
      </section>

      {(s.flags.insufficientHistory || s.flags.multiCatalyst || s.flags.isIndexOrEtf) ? (
        <ul className="mt-3 flex flex-wrap gap-2 text-[12px] text-ink-2">
          {s.flags.insufficientHistory ? <Flag>Thin history: {s.flags.baselineDaysWithActivity} active baseline sessions</Flag> : null}
          {s.flags.multiCatalyst ? <Flag>Another catalyst falls inside this window</Flag> : null}
          {s.flags.isIndexOrEtf ? <Flag>Index or ETF: scored but never ranked</Flag> : null}
        </ul>
      ) : null}

      {/* ---------------- Exhibit A ---------------- */}
      <section aria-labelledby="trace-h" className="sheet mt-6 overflow-hidden">
        <header className="flex flex-wrap items-baseline justify-between gap-2 border-b hairline px-5 py-4 sm:px-6">
          <div>
            <p className="label mb-1">Exhibit A</p>
            <h2 id="trace-h" className="display text-[20px]">The trace</h2>
          </div>
          <p className="text-[12.5px] text-ink-3">Hover, or focus and use ← →, to read each session</p>
        </header>
        <div className="px-3 pb-2 pt-4 sm:px-6">
          <Trace
            bars={chartBars}
            daily={stored.breakdown.daily}
            windowDays={windowDays}
            eventDate={s.catalyst.eventDate}
            reactionDate={s.partialWindow ? null : rw.to}
            signals={stored.breakdown.signals}
            eventLabel={s.catalyst.title}
          />
        </div>
      </section>

      {/* ---------------- Story, receipt, receipts, ask ---------------- */}
      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_400px]">
        <div className="grid content-start gap-6">
          <Narration catalystId={s.catalyst.id} score={s.score} initial={ev.narration} />
          <ScoreReceipt signals={stored.breakdown.signals} score={s.score} />
        </div>
        <div className="grid content-start gap-6">
          <AlertsPanel alerts={alerts} ticker={s.catalyst.ticker} />
          <AskPanel
            ticker={s.catalyst.ticker}
            eventDate={s.catalyst.eventDate}
            summary={`${s.catalyst.ticker} ${s.catalyst.title} on ${s.catalyst.eventDate}: score ${s.score}, ${s.direction}, verdict ${s.verdict}.`}
          />
        </div>
      </div>

      {pastRelated.length > 0 ? (
        <section className="mt-16" aria-labelledby="related-h">
          <div className="mb-4 flex items-end justify-between gap-4">
            <h2 id="related-h" className="display text-[26px]">
              Other cases for <span className="font-mono font-semibold tracking-normal">{s.catalyst.ticker}</span>
            </h2>
            <Link href={`/ticker/${s.catalyst.ticker}`} className="pressable shrink-0 text-[13px] font-medium text-ink underline decoration-line-strong underline-offset-4 hover:decoration-ink">
              Open the dossier →
            </Link>
          </div>
          <CaseList rows={pastRelated} animate={false} />
        </section>
      ) : null}
    </div>
  );
}

function Stat({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="border-b hairline px-5 py-4 md:border-b-0 [&:nth-child(odd)]:border-r md:[&:nth-child(odd)]:border-r-0">
      <p className="label mb-2">{label}</p>
      {children}
    </div>
  );
}

function Flag({ children }: { children: React.ReactNode }) {
  return <li className="rounded-full border border-line-strong bg-surface px-3 py-1">{children}</li>;
}

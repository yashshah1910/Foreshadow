"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { StripDay } from "@/lib/data";
import { TellStrip } from "@/components/viz/TellStrip";
import { track } from "@/lib/analytics";
import { fmtDate, fmtPct, KIND_LABELS } from "@/lib/format";
import { money, OUTCOME_SHORT, type Outcome } from "@/lib/plain";

export interface GuessCase {
  id: string;
  ticker: string;
  company: string | null;
  event: string;
  eventDate: string;
  kind: string;
  score: number;
  lean: "rise" | "fall";
  impliedMovePct: number | null;
  movePct: number;
  outcome: Outcome;
  strip: StripDay[];
}

type Guess = "rise" | "fall";

const ROUNDS = 5;
const BEST_KEY = "fs-guess-best";

/** Five random cases from the pool, picked when the player starts. */
function deal(pool: GuessCase[]): GuessCase[] {
  const left = [...pool];
  const out: GuessCase[] = [];
  while (out.length < ROUNDS && left.length > 0) out.push(left.splice(Math.floor(Math.random() * left.length), 1)[0]);
  return out;
}

export function GuessGame({ pool, leanedRightPct }: { pool: GuessCase[]; leanedRightPct: number | null }) {
  const [cases, setCases] = useState<GuessCase[]>([]);
  const [guesses, setGuesses] = useState<Guess[]>([]);
  const [round, setRound] = useState(0);
  // Best score on this device, read and saved when a game ends (storage can be unavailable; then it just isn't shown).
  const [best, setBest] = useState<{ score: number; isNew: boolean } | null>(null);
  const awaiting = cases.length > 0 && round < cases.length && !guesses[round];

  const choose = (g: Guess) => {
    const c = cases[round];
    const next = [...guesses.slice(0, round), g];
    setGuesses(next);
    track("guess_made", { correct: g === dir(c), bets_correct: c.lean === dir(c), score: c.score });
    if (round + 1 === cases.length) {
      const result = tally(next, cases);
      track("guess_finished", result);
      try {
        const before = Number(localStorage.getItem(BEST_KEY)) || 0;
        if (result.you > before) localStorage.setItem(BEST_KEY, String(result.you));
        setBest({ score: Math.max(before, result.you), isNew: result.you > before && before > 0 });
      } catch {
        setBest(null);
      }
    }
  };

  // Keyboard play: ↑ it rose, ↓ it fell (Enter on the focused button moves on).
  useEffect(() => {
    if (!awaiting) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLElement && e.target.closest("input, textarea, select")) return;
      if (e.key === "ArrowUp" || e.key === "ArrowDown") {
        e.preventDefault();
        choose(e.key === "ArrowUp" ? "rise" : "fall");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (pool.length < ROUNDS) {
    return <p className="tray mt-10 p-6 text-[16px] text-ink-2">Not enough finished cases to play yet. Check back once more news has happened.</p>;
  }

  const start = () => {
    setCases(deal(pool));
    setGuesses([]);
    setRound(0);
    track("guess_started");
  };

  if (cases.length === 0) {
    return (
      <div className="tray mt-10 grid gap-2 p-2">
        <div className="card p-6">
          <h2 className="text-[19px] font-semibold text-ink">How to play</h2>
          <ol className="mt-3 grid gap-2 text-[16px] leading-relaxed text-ink-2">
            <li>1. Look at the money bet on a rise (green, above the line) and on a fall (red, below it) in the days before the news.</li>
            <li>2. Guess whether the stock rose or fell after the news.</li>
            <li>3. After five cases, see how your calls compare with simply following the bets.</li>
          </ol>
          <button type="button" onClick={start} className="pressable btn btn-primary mt-6 h-11 px-5 text-[15px]">
            Deal five cases
          </button>
        </div>
      </div>
    );
  }

  const done = round >= cases.length;
  const { you, bets } = tally(guesses, cases);

  if (done) {
    const verdict =
      you > bets ? "You beat the bets." : you === bets ? "You tied with the bets." : "The bets beat you this time.";
    const shareText = `I called ${you} of ${cases.length} stock moves from the options betting before the news; the bets called ${bets}. Try it:`;
    return (
      <div className="tray mt-10 grid gap-2 p-2" aria-live="polite">
        <div className="card p-6">
          <p className="text-[14px] font-medium text-ink-3">Your result</p>
          <p className="display mt-2 text-[34px] text-ink">{verdict}</p>
          <dl className="mt-5 grid grid-cols-2 gap-2">
            <Tally label="You called" value={`${you} of ${cases.length}`} />
            <Tally label="Following the bets" value={`${bets} of ${cases.length}`} />
          </dl>
          {best ? (
            <p className="mt-3 text-[14.5px] text-ink-2">
              {best.isNew ? <strong className="font-semibold text-ink">New best on this device.</strong> : `Your best on this device: ${best.score} of ${cases.length}.`}
            </p>
          ) : null}
          {leanedRightPct !== null ? (
            <p className="mt-5 text-[15.5px] leading-relaxed text-ink-2">
              Across every finished case with unusual betting, the stock went the way the bets leaned {leanedRightPct}% of the time. A
              coin flip gets 50%.{" "}
              <Link href="/scorecard" className="link">
                See the scorecard
              </Link>
            </p>
          ) : null}
          <div className="mt-6 flex flex-wrap gap-2">
            <button type="button" onClick={start} className="pressable btn btn-primary h-11 px-5 text-[15px]">
              Play again
            </button>
            <a
              href={`https://x.com/intent/post?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent("https://foreshadow-six.vercel.app/guess")}`}
              target="_blank"
              rel="noreferrer"
              onClick={() => track("guess_shared_x", { you, bets })}
              className="pressable btn btn-soft h-11 px-5 text-[15px]"
            >
              Post your score on X
            </a>
          </div>
        </div>
        <ol className="grid gap-1.5">
          {cases.map((c, i) => (
            <li key={c.id} className="card flex flex-wrap items-center justify-between gap-3 px-4 py-3">
              <Link href={`/event/${encodeURIComponent(c.id)}`} className="min-w-0 text-[15px] text-ink hover:underline">
                <span className="ticker font-semibold">{c.ticker}</span> {c.event}, {fmtDate(c.eventDate, { year: true })}
              </Link>
              <span className="text-[14px] text-ink-2 tnum">
                {movePhrase(c)} · you said {guesses[i]} {guesses[i] === dir(c) ? "✓" : "✗"}
              </span>
            </li>
          ))}
        </ol>
      </div>
    );
  }

  const c = cases[round];
  const guess = guesses[round] as Guess | undefined;
  const counted = c.strip.filter((d) => d.inWindow);
  const onRise = counted.reduce((n, d) => n + d.call, 0);
  const onFall = counted.reduce((n, d) => n + d.put, 0);

  return (
    <div className="tray mt-10 grid gap-2 p-2">
      <div className="flex items-center justify-between px-3 pt-2 text-[14px] text-ink-3">
        <span>
          Case {round + 1} of {cases.length}
        </span>
        <span className="tnum">
          You {you} · Bets {bets}
        </span>
      </div>
      <div className="card p-5 sm:p-6">
        <p className="flex flex-wrap items-center gap-2 text-[14px] text-ink-3">
          <span className="rounded-full bg-surface-2 px-2.5 py-0.5 text-[12.5px] font-medium text-ink-2">{KIND_LABELS[c.kind] ?? c.kind}</span>
          {c.company ?? c.ticker}, {fmtDate(c.eventDate, { year: true })}
        </p>
        <h2 className="display mt-2 text-[28px] text-ink sm:text-[34px]">
          <span className="ticker">{c.ticker}</span> {c.event}
        </h2>

        <div className="mt-6 grid gap-6 sm:grid-cols-[auto_minmax(0,1fr)] sm:items-center">
          <div>
            <p className="text-[13px] font-medium text-ink-3">Large options bets, ten trading days before</p>
            <div className="mt-2">
              <TellStrip days={c.strip} width={264} height={72} />
            </div>
            <p className="mt-2 text-[12.5px] text-ink-3">Highlighted: the five days that count. The dark bar is the news.</p>
          </div>
          <dl className="grid grid-cols-2 gap-2">
            <Tally label="Unusual betting" value={`${c.score} / 100`} />
            <Tally label="Options priced in" value={c.impliedMovePct !== null ? `±${fmtPct(c.impliedMovePct, { sign: false })}` : "—"} />
            <Tally label="Bet on a rise" value={money(onRise)} tone="call" />
            <Tally label="Bet on a fall" value={money(onFall)} tone="put" />
          </dl>
        </div>

        {!guess ? (
          <div className="mt-7">
            <p className="text-[17px] font-semibold text-ink">After the news, did {c.ticker} rise or fall?</p>
            <p className="mt-1 hidden text-[13px] text-ink-3 sm:block">Or press ↑ or ↓ on your keyboard.</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <GuessButton onClick={() => choose("rise")} tone="call">
                ↑ It rose
              </GuessButton>
              <GuessButton onClick={() => choose("fall")} tone="put">
                ↓ It fell
              </GuessButton>
            </div>
          </div>
        ) : (
          <div className="mt-7 grid gap-2" aria-live="polite">
            <p className="display text-[26px] text-ink">
              {guess === dir(c) ? "You got it." : "Not this time."} {c.ticker} {movePhrase(c)}.
            </p>
            <p className="text-[16px] leading-relaxed text-ink-2">
              The bets leaned toward a {c.lean}
              {c.lean === dir(c) ? ", so they pointed the right way" : ", so they pointed the wrong way"}. Foreshadow&apos;s result:{" "}
              <strong className="font-semibold text-ink">{OUTCOME_SHORT[c.outcome]}</strong>
              {c.outcome === "rightWay" ? ", because the move was smaller than options expected" : ""}.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" onClick={() => setRound((r) => r + 1)} className="pressable btn btn-primary h-11 px-5 text-[15px]" autoFocus>
                {round + 1 < cases.length ? "Next case" : "See your result"}
              </button>
              <Link href={`/event/${encodeURIComponent(c.id)}`} target="_blank" className="pressable btn btn-soft h-11 px-5 text-[15px]">
                Open the full case
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/** Right calls so far: the player's, and those of simply following the bets. */
function tally(guesses: Guess[], cases: GuessCase[]): { you: number; bets: number } {
  return {
    you: guesses.filter((g, i) => g === dir(cases[i])).length,
    bets: guesses.filter((_, i) => cases[i].lean === dir(cases[i])).length,
  };
}

function dir(c: GuessCase): Guess {
  return c.movePct >= 0 ? "rise" : "fall";
}

function movePhrase(c: GuessCase): string {
  return `${c.movePct >= 0 ? "rose" : "fell"} ${fmtPct(Math.abs(c.movePct), { sign: false })}`;
}

function Tally({ label, value, tone }: { label: string; value: string; tone?: "call" | "put" }) {
  return (
    <div className="rounded-xl bg-surface-2 px-3.5 py-2.5">
      <dt className="text-[12.5px] font-medium text-ink-3">{label}</dt>
      <dd className={`numeral mt-1 text-[20px] ${tone === "call" ? "text-call-ink" : tone === "put" ? "text-put-ink" : "text-ink"}`}>{value}</dd>
    </div>
  );
}

function GuessButton({ onClick, tone, children }: { onClick: () => void; tone: "call" | "put"; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`pressable btn h-12 min-w-[9rem] px-5 text-[16px] font-semibold text-white ${tone === "call" ? "bg-call-ink" : "bg-put-ink"} hover:opacity-90`}
    >
      {children}
    </button>
  );
}

import type { Metadata } from "next";
import { getLeaderboard, getScorecard } from "@/lib/data";
import { GuessGame, type GuessCase } from "@/components/guess/GuessGame";
import { eventName, outcomeOf } from "@/lib/plain";
import { prettyCompanyName } from "@/lib/data/shared";

export const metadata: Metadata = {
  title: "Guess the move",
  description:
    "Five real cases. See the options betting before the news, guess whether the stock rose or fell, and find out whether you or the bets called it better.",
};

// A fresh deal of cases per visit.
export const dynamic = "force-dynamic";

export default async function GuessPage() {
  const [rows, card] = await Promise.all([getLeaderboard({ minScore: 40, days: 365, limit: 400 }), getScorecard()]);
  // Finished cases where the bets leaned one way and the stock clearly moved, so every round has an answer.
  const pool: GuessCase[] = rows
    .filter((r) => (r.verdict === "matched" || r.verdict === "missed") && r.direction !== "mixed" && r.realizedMovePct !== null)
    .filter((r) => Math.abs(r.realizedMovePct!) >= 0.5)
    .slice(0, 120)
    .map((r) => ({
      id: r.catalyst.id,
      ticker: r.catalyst.ticker,
      company: r.company ? prettyCompanyName(r.company.name) : null,
      event: eventName(r),
      eventDate: r.catalyst.eventDate,
      kind: r.catalyst.kind,
      score: Math.round(r.score),
      lean: r.direction === "bullish" ? "rise" : "fall",
      impliedMovePct: r.impliedMovePct,
      movePct: r.realizedMovePct!,
      outcome: outcomeOf(r),
      strip: r.strip,
    }));
  // Across finished unusual cases, how often the stock went the way the bets leaned: the bar a player is up against.
  const unusual = card.kinds.flatMap((k) => k.bands.filter((b) => b.min >= 40));
  const leaned = unusual.reduce((n, b) => n + b.leaned, 0);
  const leanedRightPct = leaned > 0 ? Math.round((unusual.reduce((n, b) => n + b.leanedRight, 0) / leaned) * 100) : null;

  return (
    <div className="mx-auto max-w-[860px] px-5 py-12 sm:px-8 lg:py-16">
      <header className="max-w-[720px]">
        <h1 className="display text-[44px] text-ink sm:text-[60px]">Guess the move</h1>
        <p className="prose-plain mt-5">
          Five real cases from the last year. For each one you see the options betting in the days before the news, with the result
          hidden. Guess whether the stock rose or fell, then see whether you or the bets called it better.
        </p>
      </header>
      <GuessGame pool={pool} leanedRightPct={leanedRightPct} />
    </div>
  );
}

import Link from "next/link";
import { getStats } from "@/lib/data";
import { fmtDate } from "@/lib/format";
import { Mark } from "./Wordmark";

export async function Footer() {
  const stats = await getStats().catch(() => null);
  return (
    <footer className="mt-32 bg-surface-2">
      <div className="mx-auto grid max-w-[1120px] gap-10 px-5 py-14 text-[15px] text-ink-2 sm:px-8 md:grid-cols-[1.5fr_1fr_1fr]">
        <div>
          <p className="flex items-center gap-2 text-ink">
            <Mark size={20} />
            <span className="display text-[20px]">Foreshadow</span>
          </p>
          <p className="mt-3 max-w-sm leading-relaxed text-ink-3">
            Made for the Unusual Whales API Hackathon. Unusual betting is not proof of wrongdoing, and nothing here is
            financial advice.
          </p>
        </div>
        <div className="flex flex-col gap-2.5">
          <Link href="/leaderboard" className="hover:text-ink">Past cases</Link>
          <Link href="/radar" className="hover:text-ink">Coming up</Link>
          <Link href="/scorecard" className="hover:text-ink">Scorecard</Link>
          <Link href="/docs" className="hover:text-ink">How it works</Link>
        </div>
        <div className="flex flex-col gap-2.5">
          <Link href="/docs#mcp" className="hover:text-ink">Use it from Claude</Link>
          <Link href="/docs#api" className="hover:text-ink">API</Link>
          {stats?.lastComputedAt ? <span className="text-ink-3">Scores updated {fmtDate(stats.lastComputedAt.slice(0, 10), { year: true })}</span> : null}
        </div>
      </div>
    </footer>
  );
}

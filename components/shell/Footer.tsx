import Link from "next/link";
import { getStats } from "@/lib/data";
import { Mark } from "./Wordmark";

export async function Footer() {
  const stats = await getStats().catch(() => null);
  return (
    <footer className="mt-24 border-t hairline">
      <div className="mx-auto grid max-w-[1200px] gap-6 px-4 py-10 text-[13px] text-ink-2 sm:px-6 md:grid-cols-[1fr_auto]">
        <div className="flex gap-3">
          <span className="text-ink"><Mark size={20} /></span>
          <div>
            <p className="text-ink">Foreshadow</p>
            <p className="mt-1 max-w-md text-ink-3">
              Built on the Unusual Whales API for Hackathon #1. Every score is deterministic and reproducible from the
              rows shown beside it. Not financial advice; Foreshadow detects positioning, never intent.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-start gap-x-6 gap-y-2">
          <Link href="/leaderboard" className="hover:text-ink">Leaderboard</Link>
          <Link href="/radar" className="hover:text-ink">Live Radar</Link>
          <Link href="/docs" className="hover:text-ink">How it works</Link>
          <Link href="/docs#mcp" className="hover:text-ink">MCP</Link>
          {stats?.lastComputedAt ? <span className="font-mono text-[11.5px] text-ink-3 tnum">scored {stats.lastComputedAt.slice(0, 10)}</span> : null}
        </div>
      </div>
    </footer>
  );
}

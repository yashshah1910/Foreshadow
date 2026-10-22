import Link from "next/link";
import { getStats } from "@/lib/data";

export async function Footer() {
  const stats = await getStats().catch(() => null);
  return (
    <footer className="mt-28 border-t hairline">
      <div className="mx-auto grid max-w-[1080px] gap-8 px-5 py-12 text-[14px] text-ink-2 sm:px-8 md:grid-cols-[1.4fr_1fr_1fr]">
        <div>
          <p className="display text-[19px] text-ink">Foreshadow</p>
          <p className="mt-2 max-w-sm leading-relaxed text-ink-3">
            Made for the Unusual Whales API Hackathon. Unusual betting is not proof of wrongdoing, and nothing here is
            financial advice.
          </p>
        </div>
        <div className="flex flex-col gap-2">
          <Link href="/leaderboard" className="hover:text-ink">Past cases</Link>
          <Link href="/radar" className="hover:text-ink">Coming up</Link>
          <Link href="/docs" className="hover:text-ink">How it works</Link>
        </div>
        <div className="flex flex-col gap-2">
          <Link href="/docs#mcp" className="hover:text-ink">Use it from Claude (MCP)</Link>
          <Link href="/docs#api" className="hover:text-ink">API</Link>
          {stats?.lastComputedAt ? <span className="text-ink-3">Updated {stats.lastComputedAt.slice(0, 10)}</span> : null}
        </div>
      </div>
    </footer>
  );
}

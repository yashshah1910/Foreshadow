import Link from "next/link";
import { Wordmark } from "./Wordmark";
import { TickerSearch } from "./TickerSearch";
import { NavLink } from "./NavLink";
import { ThemeToggle } from "./ThemeToggle";
import { AuthMenu } from "./AuthMenu";
import { getStats } from "@/lib/data";
import { hasSupabase } from "@/lib/env";

export async function Header() {
  const stats = await getStats().catch(() => null);
  return (
    <header className="sticky top-0 z-40 border-b hairline bg-bg/80 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-[1200px] items-center gap-3 px-4 sm:px-6">
        <Wordmark />
        <nav className="ml-4 hidden items-center gap-0.5 md:flex" aria-label="Primary">
          <NavLink href="/leaderboard">Leaderboard</NavLink>
          <NavLink href="/radar">Live Radar</NavLink>
          <NavLink href="/docs">How it works</NavLink>
        </nav>
        <div className="ml-auto flex items-center gap-2">
          {stats?.synthetic ? (
            <Link
              href="/docs#run"
              className="hidden items-center gap-1.5 rounded-md px-2 py-1 font-mono text-[11px] uppercase tracking-wider text-ink-3 hover:text-ink-2 lg:inline-flex"
              title="This deployment serves the generated demo dataset (fictional tickers). Add a UW key for real data."
            >
              <span className="h-2 w-2 rotate-45 bg-hl" aria-hidden="true" />
              Demo dataset
            </Link>
          ) : null}
          <TickerSearch />
          <ThemeToggle />
          {hasSupabase() ? <AuthMenu /> : null}
        </div>
      </div>
      <nav className="flex items-center gap-0.5 px-3 pb-2 md:hidden" aria-label="Primary (mobile)">
        <NavLink href="/leaderboard">Leaderboard</NavLink>
        <NavLink href="/radar">Radar</NavLink>
        <NavLink href="/docs">How it works</NavLink>
      </nav>
    </header>
  );
}

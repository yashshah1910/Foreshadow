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
    <header className="border-b hairline bg-bg">
      {stats?.synthetic ? (
        <p className="bg-surface-2 px-4 py-1.5 text-center text-[12.5px] text-ink-2">
          You&apos;re looking at sample data with made-up tickers.{" "}
          <Link href="/docs#run" className="underline underline-offset-2 hover:text-ink">How to load real data</Link>
        </p>
      ) : null}
      <div className="mx-auto flex h-16 max-w-[1080px] items-center gap-3 px-5 sm:px-8">
        <Wordmark />
        <nav className="ml-6 hidden items-center gap-1 md:flex" aria-label="Primary">
          <NavLink href="/leaderboard">Past cases</NavLink>
          <NavLink href="/radar">Coming up</NavLink>
          <NavLink href="/docs">How it works</NavLink>
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <TickerSearch />
          <ThemeToggle />
          {hasSupabase() ? <AuthMenu /> : null}
        </div>
      </div>
      <nav className="flex items-center gap-1 px-4 pb-2 md:hidden" aria-label="Primary (mobile)">
        <NavLink href="/leaderboard">Past cases</NavLink>
        <NavLink href="/radar">Coming up</NavLink>
        <NavLink href="/docs">How it works</NavLink>
      </nav>
    </header>
  );
}

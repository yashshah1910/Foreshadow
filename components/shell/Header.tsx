import Link from "next/link";
import { Wordmark } from "./Wordmark";
import { TickerSearch } from "./TickerSearch";
import { NavLink } from "./NavLink";
import { AuthMenu } from "./AuthMenu";
import { getStats } from "@/lib/data";
import { hasSupabase } from "@/lib/env";

export async function Header() {
  const stats = await getStats().catch(() => null);
  return (
    <header className="bg-bg">
      {stats?.synthetic ? (
        <p className="bg-hl/60 px-4 py-2 text-center text-[13px] text-ink">
          You&apos;re looking at sample data with made-up tickers.{" "}
          <Link href="/docs#run" className="font-medium underline underline-offset-2">How to load real data</Link>
        </p>
      ) : null}
      <div className="mx-auto flex h-[72px] max-w-[1120px] items-center gap-3 px-5 sm:px-8">
        <Wordmark />
        <nav className="ml-8 hidden items-center gap-1 md:flex" aria-label="Primary">
          <NavLink href="/leaderboard">Past cases</NavLink>
          <NavLink href="/radar">Coming up</NavLink>
          <NavLink href="/docs">How it works</NavLink>
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <TickerSearch />
          {hasSupabase() ? <AuthMenu /> : null}
        </div>
      </div>
      <nav className="-mt-2 flex items-center gap-1 overflow-x-auto px-4 pb-3 md:hidden" aria-label="Primary (mobile)">
        <NavLink href="/leaderboard">Past cases</NavLink>
        <NavLink href="/radar">Coming up</NavLink>
        <NavLink href="/docs">How it works</NavLink>
      </nav>
    </header>
  );
}

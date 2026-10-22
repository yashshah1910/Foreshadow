import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-[1120px] px-5 py-20 sm:px-8 sm:py-28">
      <div className="tray max-w-[640px] p-8 sm:p-10">
        <p className="text-[15px] font-medium text-ink-3">Page not found</p>
        <h1 className="display mt-3 text-[40px] text-ink sm:text-[48px]">Nothing here yet.</h1>
        <p className="mt-4 text-[17px] leading-relaxed text-ink-2">
          If you were looking for a stock, Foreshadow may not have any of its news on file. It covers FDA decisions and
          earnings for companies worth over $2B with listed options.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link href="/leaderboard" className="pressable btn btn-primary">Browse past cases</Link>
          <Link href="/" className="pressable btn bg-surface text-ink hover:bg-surface-3">Go to the home page</Link>
        </div>
      </div>
    </div>
  );
}

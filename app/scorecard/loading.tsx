export default function Loading() {
  return (
    <div className="mx-auto max-w-[1120px] px-5 py-12 sm:px-8 lg:py-16" aria-busy="true">
      <div className="h-14 w-64 animate-pulse rounded-2xl bg-surface-2" />
      <div className="mt-5 h-5 w-[36rem] max-w-full animate-pulse rounded-full bg-surface-2" />
      <div className="mt-12 grid gap-2 md:grid-cols-2">
        <div className="tray h-[120px] animate-pulse" />
        <div className="tray h-[120px] animate-pulse" />
      </div>
      <div className="mt-20 grid gap-2 lg:grid-cols-2">
        <div className="tray h-[320px] animate-pulse" />
        <div className="tray h-[320px] animate-pulse" />
      </div>
      <p className="sr-only" role="status">Loading the scorecard…</p>
    </div>
  );
}

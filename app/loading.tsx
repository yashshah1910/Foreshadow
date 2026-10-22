/** Shown the moment a link is clicked, until the page's data arrives. */
export default function Loading() {
  return (
    <div className="mx-auto max-w-[1120px] px-5 pt-12 sm:px-8 sm:pt-20" aria-busy="true" aria-label="Loading">
      <div className="grid gap-12 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:gap-14">
        <div className="min-w-0">
          <div className="h-12 w-11/12 animate-pulse rounded-2xl bg-surface-2 sm:h-16" />
          <div className="mt-3 h-12 w-8/12 animate-pulse rounded-2xl bg-surface-2 sm:h-16" />
          <div className="mt-8 h-4 w-full animate-pulse rounded-full bg-surface-2" />
          <div className="mt-3 h-4 w-10/12 animate-pulse rounded-full bg-surface-2" />
          <div className="mt-3 h-4 w-7/12 animate-pulse rounded-full bg-surface-2" />
          <div className="mt-9 flex gap-3">
            <div className="h-11 w-40 animate-pulse rounded-full bg-surface-3" />
            <div className="h-11 w-44 animate-pulse rounded-full bg-surface-2" />
          </div>
        </div>
        <div className="tray h-[360px] animate-pulse sm:h-[420px]" />
      </div>
      <p className="sr-only" role="status">Loading the page…</p>
    </div>
  );
}

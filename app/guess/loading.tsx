export default function Loading() {
  return (
    <div className="mx-auto max-w-[860px] px-5 py-12 sm:px-8 lg:py-16" aria-busy="true">
      <div className="h-14 w-72 animate-pulse rounded-2xl bg-surface-2" />
      <div className="mt-5 h-5 w-[36rem] max-w-full animate-pulse rounded-full bg-surface-2" />
      <div className="tray mt-10 h-[260px] animate-pulse" />
      <p className="sr-only" role="status">Dealing cases…</p>
    </div>
  );
}

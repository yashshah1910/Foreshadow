export default function Loading() {
  return (
    <div className="mx-auto max-w-[1200px] px-4 py-8 sm:px-6 lg:py-10" aria-busy="true">
      <div className="h-3 w-56 rounded bg-surface-3" />
      <div className="mt-10 h-14 w-40 rounded bg-surface-3" />
      <div className="mt-4 h-10 w-2/3 rounded bg-surface-3" />
      <div className="sheet mt-8 h-[88px]" />
      <div className="sheet mt-6 h-[560px]" />
    </div>
  );
}

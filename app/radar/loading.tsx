export default function Loading() {
  return (
    <div className="mx-auto max-w-[1120px] px-5 py-12 sm:px-8 lg:py-16" aria-busy="true">
      <div className="h-14 w-64 rounded-2xl bg-surface-2" />
      <div className="mt-5 h-5 w-[32rem] max-w-full rounded-full bg-surface-2" />
      <div className="tray mt-12 grid gap-1.5 p-2.5">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="card h-[76px]" />
        ))}
      </div>
    </div>
  );
}

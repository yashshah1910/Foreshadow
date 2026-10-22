/** The timeline every score is built on, in plain words. */
export function WindowsDiagram() {
  return (
    <figure className="tray mt-12 p-6 sm:p-8">
      <div className="grid grid-cols-[minmax(0,6fr)_minmax(0,3fr)_auto_minmax(0,2fr)] items-end gap-x-2">
        <Seg label="Normal period" sub="60 trading days" className="bg-surface-3" />
        <Seg label="The 5 days before" sub="what we measure" className="bg-hl" />
        <span className="mb-0 h-16 w-[3px] rounded-full bg-ink" aria-hidden="true" />
        <Seg label="The news" sub="then we check the move" className="bg-surface" />
      </div>
      <figcaption className="mt-5 text-[15px] text-ink-2">
        Each stock is compared only with itself, so a quiet biotech and a giant like Apple are judged fairly.
      </figcaption>
    </figure>
  );
}

function Seg({ label, sub, className }: { label: string; sub: string; className: string }) {
  return (
    <div className="min-w-0">
      <p className="text-[15px] font-semibold text-ink">{label}</p>
      <p className="mb-2.5 truncate text-[13.5px] text-ink-3">{sub}</p>
      <div className={`h-5 rounded-full ${className}`} />
    </div>
  );
}

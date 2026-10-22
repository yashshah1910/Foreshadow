/** The timeline every score is built on, in plain words. */
export function WindowsDiagram() {
  return (
    <figure className="mt-8">
      <div className="grid grid-cols-[minmax(0,6fr)_minmax(0,3fr)_auto_minmax(0,2fr)] items-end gap-x-2">
        <Seg label="Normal period" sub="60 trading days" className="bg-surface-3" />
        <Seg label="The 5 days before" sub="this is what we measure" className="bg-hl" />
        <span className="mb-[1px] h-14 w-[2px] rounded bg-ink" aria-hidden="true" />
        <Seg label="The news" sub="then we check the move" className="border border-line-strong" />
      </div>
      <figcaption className="mt-3 text-[13.5px] text-ink-3">
        Each stock is compared only with itself, so a quiet biotech and a giant like Apple are judged fairly.
      </figcaption>
    </figure>
  );
}

function Seg({ label, sub, className }: { label: string; sub: string; className: string }) {
  return (
    <div className="min-w-0">
      <p className="text-[14px] font-medium text-ink">{label}</p>
      <p className="mb-2 truncate text-[12.5px] text-ink-3">{sub}</p>
      <div className={`h-4 rounded-sm ${className}`} />
    </div>
  );
}

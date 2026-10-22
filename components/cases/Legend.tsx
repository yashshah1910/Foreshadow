export function Legend({ live = false }: { live?: boolean }) {
  return (
    <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2 text-[12px] text-ink-3">
      <span className="flex items-center gap-2">
        <span className="flex flex-col gap-px" aria-hidden="true">
          <span className="h-1.5 w-2 rounded-[1px] bg-call" />
          <span className="h-1.5 w-2 rounded-[1px] bg-put" />
        </span>
        Call premium up, put premium down
      </span>
      <span className="flex items-center gap-2">
        <span className="h-3 w-5 -skew-x-6 rounded-[2px] bg-hl" aria-hidden="true" />
        Footprint window, T-5 to T-1
      </span>
      {live ? (
        <span className="flex items-center gap-2">
          <span className="h-[5px] w-2 rounded-[1.5px] border border-ink-3" aria-hidden="true" />
          Session still to come
        </span>
      ) : (
        <span className="flex items-center gap-2">
          <span className="h-3 w-6 rounded-[2px] bg-surface-3" aria-hidden="true" />
          ±Implied move band; the bar is the realized move
        </span>
      )}
    </div>
  );
}

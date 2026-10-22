"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useOptimistic } from "react";
import { useListPending } from "./ListPending";
import { PAGE, type FilterState } from "./filters-state";
import { track } from "@/lib/analytics";

const KINDS = [
  ["all", "All news"],
  ["fda", "FDA"],
  ["earnings", "Earnings"],
] as const;

export function Filters({ initial, total }: { initial: FilterState; total: number }) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const { pending, startTransition } = useListPending();
  const [state, setOptimistic] = useOptimistic(initial);

  function update(patch: Partial<FilterState>) {
    const next = { ...state, ...patch };
    track("cases_filtered", { ...patch, kind: next.kind, days: next.days, sort: next.sort });
    const params = new URLSearchParams(sp.toString());
    if (next.kind === "all") params.delete("kind");
    else params.set("kind", next.kind);
    if (next.min70) params.set("min", "70");
    else params.delete("min");
    if (next.matched) params.set("matched", "1");
    else params.delete("matched");
    if (next.days === 90) params.delete("days");
    else params.set("days", String(next.days));
    if (next.sort === "score") params.delete("sort");
    else params.set("sort", next.sort);
    // A new filter starts back at the first page.
    params.delete("show");
    startTransition(() => {
      setOptimistic({ ...next, show: PAGE });
      router.replace(`${pathname}${params.size ? `?${params}` : ""}`, { scroll: false });
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2" aria-busy={pending || undefined}>
      <Segmented
        label="Catalyst type"
        options={KINDS.map(([v, l]) => ({ value: v, label: l }))}
        value={state.kind}
        onChange={(v) => update({ kind: v })}
      />
      <Toggle on={state.min70} onClick={() => update({ min70: !state.min70 })}>
        Very unusual only
      </Toggle>
      <Toggle on={state.matched} onClick={() => update({ matched: !state.matched })}>
        Bets were right
      </Toggle>
      <Segmented
        label="Window"
        options={[
          { value: "30", label: "30 days" },
          { value: "90", label: "90 days" },
          { value: "365", label: "1 year" },
        ]}
        value={String(state.days)}
        onChange={(v) => update({ days: Number(v) })}
      />
      <Segmented
        label="Sort"
        options={[
          { value: "score", label: "Most unusual" },
          { value: "new", label: "Newest" },
          { value: "move", label: "Biggest move" },
        ]}
        value={state.sort}
        onChange={(v) => update({ sort: v as FilterState["sort"] })}
      />
      <span className="ml-auto text-[15px] text-ink-3 tnum" aria-live="polite">
        {pending ? "Updating…" : total >= state.show ? `Top ${total}` : `${total} case${total === 1 ? "" : "s"}`}
      </span>
    </div>
  );
}

function Segmented({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { value: string; label: string }[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div role="group" aria-label={label} className="flex max-w-full items-center overflow-x-auto rounded-full bg-surface-2 p-1 [scrollbar-width:none]">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={value === o.value}
          onClick={() => onChange(o.value)}
          className={`pressable shrink-0 whitespace-nowrap rounded-full px-3.5 py-1.5 text-[14.5px] font-medium ${
            value === o.value ? "bg-surface text-ink shadow-[0_1px_3px_rgba(19,23,34,0.1)]" : "text-ink-2 hover:text-ink"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Toggle({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={`pressable inline-flex h-10 items-center gap-2 rounded-full px-4 text-[14.5px] font-medium ${
        on ? "bg-ink text-surface" : "bg-surface-2 text-ink-2 hover:bg-surface-3 hover:text-ink"
      }`}
    >
      <span className={`grid h-4 w-4 place-items-center rounded-full ${on ? "bg-hl text-ink" : "bg-surface"}`} aria-hidden="true">
        {on ? (
          <svg width="9" height="9" viewBox="0 0 12 12">
            <path d="M2 6.5 4.8 9 10 3" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        ) : null}
      </span>
      {children}
    </button>
  );
}

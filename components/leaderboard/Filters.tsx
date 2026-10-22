"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useOptimistic, useTransition } from "react";
import type { FilterState } from "./filters-state";

const KINDS = [
  ["all", "All news"],
  ["fda", "FDA"],
  ["earnings", "Earnings"],
  ["congress", "Congress"],
  ["insider", "Insiders"],
] as const;

export function Filters({ initial, total }: { initial: FilterState; total: number }) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [state, setOptimistic] = useOptimistic(initial);

  function update(patch: Partial<FilterState>) {
    const next = { ...state, ...patch };
    const params = new URLSearchParams(sp.toString());
    if (next.kind === "all") params.delete("kind");
    else params.set("kind", next.kind);
    if (next.min70) params.set("min", "70");
    else params.delete("min");
    if (next.matched) params.set("matched", "1");
    else params.delete("matched");
    if (next.days === 90) params.delete("days");
    else params.set("days", String(next.days));
    startTransition(() => {
      setOptimistic(next);
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
      <span className="ml-auto text-[14px] text-ink-3 tnum" aria-live="polite">
        {total} case{total === 1 ? "" : "s"}
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
    <div role="group" aria-label={label} className="flex items-center rounded border hairline p-[3px]">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={value === o.value}
          onClick={() => onChange(o.value)}
          className={`pressable rounded-[3px] px-3 py-[5px] text-[14px] ${
            value === o.value ? "bg-ink font-medium text-surface" : "text-ink-2 hover:bg-surface-2 hover:text-ink"
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
      className={`pressable inline-flex h-[36px] items-center gap-2 rounded border px-3 text-[14px] ${
        on ? "border-ink bg-surface font-medium text-ink" : "hairline bg-surface text-ink-2 hover:text-ink"
      }`}
    >
      <span className={`grid h-3.5 w-3.5 place-items-center rounded-[3px] border ${on ? "border-ink bg-ink text-surface" : "border-line-strong"}`} aria-hidden="true">
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

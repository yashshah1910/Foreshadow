"use client";

import { useRouter } from "next/navigation";
import { createContext, useContext, useTransition } from "react";

/**
 * Filters and "Show more" change only the query string, so Next keeps the old
 * list on screen while the new one loads and no loading.tsx appears. This
 * shares the transition's pending state so the list can show it.
 */
const Ctx = createContext<{ pending: boolean; startTransition: (fn: () => void) => void }>({
  pending: false,
  startTransition: (fn) => fn(),
});

export function ListPendingProvider({ children }: { children: React.ReactNode }) {
  const [pending, startTransition] = useTransition();
  return <Ctx.Provider value={{ pending, startTransition }}>{children}</Ctx.Provider>;
}

export function useListPending() {
  return useContext(Ctx);
}

/** Dims the list and says it's updating while a filter change loads. */
export function PendingRegion({ children }: { children: React.ReactNode }) {
  const { pending } = useListPending();
  return (
    <div className="relative" aria-busy={pending || undefined}>
      {pending ? (
        <div className="pointer-events-none absolute inset-x-0 top-3 z-10 flex justify-center" role="status">
          <span className="pop inline-flex items-center gap-2 px-4 py-2 text-[14px] font-medium text-ink">
            <span className="h-2 w-2 rounded-full bg-ink motion-safe:animate-pulse" aria-hidden="true" />
            Updating cases…
          </span>
        </div>
      ) : null}
      <div className={`transition-opacity duration-200 ${pending ? "pointer-events-none opacity-45" : ""}`}>{children}</div>
    </div>
  );
}

/** "Show more" as a transition, so it shares the pending state. */
export function ShowMoreButton({ href, children }: { href: string; children: React.ReactNode }) {
  const router = useRouter();
  const { pending, startTransition } = useListPending();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => startTransition(() => router.replace(href, { scroll: false }))}
      className="pressable btn btn-soft disabled:opacity-60"
    >
      {pending ? "Loading…" : children}
    </button>
  );
}

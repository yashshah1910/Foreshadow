export interface FilterState {
  kind: string;
  min70: boolean;
  matched: boolean;
  days: number;
  /** How many rows to show; "Show more" raises it in steps of PAGE. */
  show: number;
  sort: "score" | "new" | "move";
}

export const PAGE = 20;
const MAX_SHOW = 200;

export function readFilters(sp: URLSearchParams | Record<string, string | string[] | undefined>): FilterState {
  const get = (k: string) => {
    const v = sp instanceof URLSearchParams ? sp.get(k) : sp[k];
    return Array.isArray(v) ? v[0] : (v ?? null);
  };
  return {
    // Only FDA and earnings are scored; older links to other kinds fall back to everything.
    kind: ["fda", "earnings"].includes(get("kind") ?? "") ? (get("kind") as string) : "all",
    min70: get("min") === "70",
    matched: get("matched") === "1",
    days: Number(get("days")) === 30 ? 30 : 90,
    sort: get("sort") === "new" ? "new" : get("sort") === "move" ? "move" : "score",
    show: Math.min(MAX_SHOW, Math.max(PAGE, Math.round((Number(get("show")) || PAGE) / PAGE) * PAGE)),
  };
}

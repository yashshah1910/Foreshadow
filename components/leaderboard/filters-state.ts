export interface FilterState {
  kind: string;
  min70: boolean;
  matched: boolean;
  days: number;
}

export function readFilters(sp: URLSearchParams | Record<string, string | string[] | undefined>): FilterState {
  const get = (k: string) => {
    const v = sp instanceof URLSearchParams ? sp.get(k) : sp[k];
    return Array.isArray(v) ? v[0] : (v ?? null);
  };
  return {
    kind: get("kind") ?? "all",
    min70: get("min") === "70",
    matched: get("matched") === "1",
    days: Number(get("days") ?? 90) || 90,
  };
}

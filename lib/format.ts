/** Formatting helpers shared by server and client components. */

export function fmtMoney(n: number, opts: { compact?: boolean; decimals?: number } = {}): string {
  const { compact = true, decimals } = opts;
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  if (compact) {
    if (abs >= 1e9) return `${sign}$${(abs / 1e9).toFixed(decimals ?? 2)}B`;
    if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(decimals ?? (abs >= 1e7 ? 1 : 2))}M`;
    if (abs >= 1e3) return `${sign}$${(abs / 1e3).toFixed(decimals ?? 0)}K`;
  }
  return `${sign}$${abs.toLocaleString("en-US", { maximumFractionDigits: decimals ?? 0 })}`;
}

export function fmtPct(n: number | null | undefined, opts: { sign?: boolean; decimals?: number } = {}): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  const { sign = true, decimals = 1 } = opts;
  const s = n > 0 && sign ? "+" : "";
  return `${s}${n.toFixed(decimals)}%`;
}

export function fmtInt(n: number): string {
  return n.toLocaleString("en-US", { maximumFractionDigits: 0 });
}

export function fmtNum(n: number, decimals = 1): string {
  return n.toLocaleString("en-US", { maximumFractionDigits: decimals, minimumFractionDigits: 0 });
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function fmtDate(iso: string, opts: { year?: boolean; weekday?: boolean } = {}): string {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  const base = `${MONTHS[m - 1]} ${d}`;
  const withYear = opts.year ? `${base}, ${y}` : base;
  if (!opts.weekday) return withYear;
  const wd = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  return `${wd} ${withYear}`;
}

export function fmtDateShort(iso: string): string {
  const [, m, d] = iso.slice(0, 10).split("-").map(Number);
  return `${MONTHS[m - 1]} ${d}`;
}

export function fmtTimeEt(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString("en-US", { timeZone: "America/New_York", hour: "numeric", minute: "2-digit" });
}

export function fmtDateTimeEt(iso: string): string {
  const d = new Date(iso);
  return (
    d.toLocaleDateString("en-US", { timeZone: "America/New_York", month: "short", day: "numeric" }) +
    ", " +
    fmtTimeEt(iso) +
    " ET"
  );
}

export function fmtStrike(n: number): string {
  return Number.isInteger(n) ? `$${n}` : `$${n.toFixed(2).replace(/\.?0+$/, "")}`;
}

export function fmtExpiry(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return `${MONTHS[m - 1]} ${d} '${String(y).slice(2)}`;
}

export const KIND_LABELS: Record<string, string> = {
  fda: "FDA",
  earnings: "Earnings",
  congress: "Congress",
  insider: "Insider",
  economic: "Macro",
  potus: "POTUS",
};

export function fmtMarketcap(n: number | undefined): string {
  if (!n) return "";
  if (Math.abs(n) >= 1e12) return `$${(n / 1e12).toFixed(1)}T`;
  return fmtMoney(n, { decimals: 1 });
}

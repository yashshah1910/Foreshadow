/**
 * OCC option symbol parser.
 *
 * `MSFT231222C00375000` -> symbol MSFT, expiry 2023-12-22, call, strike 375.
 * The tail (`yymmdd` + `P|C` + 8-digit strike in thousandths) has a fixed
 * width of 15 characters, so the greedy symbol group always resolves to the
 * remaining prefix even when the root itself ends in digits (e.g. `BRK.B`,
 * `SPXW`, `TSLA1`).
 */

import type { IsoDate, OptionType } from "../../core/src/types";

export interface OccContract {
  /** Underlying root as written in the symbol (may include a `.` or digits). */
  symbol: string;
  expiry: IsoDate;
  type: OptionType;
  strike: number;
  /** The original OCC symbol. */
  raw: string;
}

const OCC_RE =
  /^(?<symbol>[A-Z0-9.]+)(?<yy>\d{2})(?<mm>\d{2})(?<dd>\d{2})(?<type>[PC])(?<strike>\d{8})$/;

/** Parse an OCC symbol; returns `null` for anything that does not match. */
export function parseOccSymbol(symbol: string): OccContract | null {
  const m = OCC_RE.exec(symbol.trim().toUpperCase());
  if (!m || !m.groups) return null;
  const { symbol: root, yy, mm, dd, type, strike } = m.groups;
  const month = Number(mm);
  const day = Number(dd);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return {
    symbol: root,
    expiry: `20${yy}-${mm}-${dd}`,
    type: type === "P" ? "put" : "call",
    strike: Number(strike) / 1000,
    raw: symbol,
  };
}

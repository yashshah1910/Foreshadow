/**
 * Small pure helpers shared by the client, mappers and loader.
 */

import type { IsoDate } from "../../core/src/types";

/**
 * Parse a UW numeric (JSON string such as "186705" or "4.05", or a number).
 * Anything non-numeric (null, "", "abc", NaN, Infinity) becomes 0.
 */
export function num(value: unknown): number {
  const n = numOpt(value);
  return n === undefined ? 0 : n;
}

/** Like `num` but returns `undefined` instead of 0 for missing/invalid input. */
export function numOpt(value: unknown): number | undefined {
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed === "") return undefined;
    const n = Number(trimmed);
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
}

/** Non-empty string or `undefined`. */
export function strOpt(value: unknown): string | undefined {
  return typeof value === "string" && value !== "" ? value : undefined;
}

/** Nullable string for payloads: non-empty string or `null`. */
export function strOrNull(value: unknown): string | null {
  return strOpt(value) ?? null;
}

/** Strict boolean: only a literal `true` counts. */
export function bool(value: unknown): boolean {
  return value === true;
}

/** Boolean or null when absent. */
export function boolOrNull(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

export function isDefined<T>(value: T | undefined | null): value is T {
  return value !== undefined && value !== null;
}

const ET_FORMAT = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/**
 * Exchange-local (America/New_York) calendar date of a UTC timestamp, so
 * `2026-10-21T23:30:00Z` (19:30 ET) is still `2026-10-21` while
 * `2026-10-22T04:01:00Z` (00:01 EDT) is `2026-10-22`. Unparseable input falls
 * back to its first ten characters.
 */
export function etTradeDate(timestamp: string): IsoDate {
  const d = new Date(timestamp);
  if (Number.isNaN(d.getTime())) return timestamp.slice(0, 10);
  let year = "";
  let month = "";
  let day = "";
  for (const part of ET_FORMAT.formatToParts(d)) {
    if (part.type === "year") year = part.value;
    else if (part.type === "month") month = part.value;
    else if (part.type === "day") day = part.value;
  }
  return `${year}-${month}-${day}`;
}

/**
 * Deterministic hash (FNV-1a and djb2 side by side) rendered as 16 hex chars.
 * Used for ids when UW does not send one; stable across runs and platforms.
 */
export function stableHash(input: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 5381;
  for (let i = 0; i < input.length; i++) {
    const c = input.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
    h2 = (Math.imul(h2, 33) + c) >>> 0;
  }
  return h1.toString(16).padStart(8, "0") + h2.toString(16).padStart(8, "0");
}

/** Lower-case, `[a-z0-9-]` only, trimmed to `max` chars; never empty. */
export function slugify(input: string, max = 60): string {
  const slug = input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, max)
    .replace(/-+$/g, "");
  return slug || "x";
}

/** `1234567.8` -> `1,234,568` (en-US, no decimals). */
export function formatUsd(value: number): string {
  return Math.round(value).toLocaleString("en-US");
}

/** Deterministic catalyst id: `${kind}:${ticker}:${eventDate}:${slug}`. */
export function catalystId(kind: string, ticker: string, eventDate: IsoDate, slugSource: string): string {
  return `${kind}:${ticker}:${eventDate}:${slugify(slugSource)}`;
}

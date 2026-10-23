import { describe, expect, it } from "vitest";
import { oneShareClass } from "@/lib/data/shared";
import type { EventSummary } from "@/lib/data";

const row = (ticker: string, name: string, score: number, eventDate = "2026-10-28"): EventSummary =>
  ({ catalyst: { ticker, kind: "earnings", eventDate }, company: { ticker, name }, score }) as unknown as EventSummary;

describe("oneShareClass", () => {
  it("keeps one row per company and event, the higher score", () => {
    const out = oneShareClass([row("GOOGL", "Alphabet", 24), row("GOOG", "Alphabet", 31), row("MSFT", "Microsoft", 13)]);
    expect(out.map((r) => r.catalyst.ticker)).toEqual(["GOOG", "MSFT"]);
  });

  it("keeps the same company's different events", () => {
    expect(oneShareClass([row("GOOG", "Alphabet", 10, "2026-07-22"), row("GOOGL", "Alphabet", 9, "2026-10-28")])).toHaveLength(2);
  });
});

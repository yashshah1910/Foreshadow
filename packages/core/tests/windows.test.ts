import { describe, expect, it } from "vitest";
import {
  addTradingDays,
  sessionStarted,
  todayIso,
  baselineWindow,
  chartWindow,
  footprintWindow,
  isTradingDay,
  partialFootprintWindow,
  tradingDaysBetween,
  upcomingTradingDays,
} from "../src/windows";

describe("trading calendar", () => {
  it("knows weekends and NYSE holidays", () => {
    expect(isTradingDay("2026-10-21")).toBe(true); // Wednesday
    expect(isTradingDay("2026-10-24")).toBe(false); // Saturday
    expect(isTradingDay("2026-07-03")).toBe(false); // Independence Day observed
    expect(isTradingDay("2026-11-26")).toBe(false); // Thanksgiving
  });

  it("footprint window is the five trading days before the event", () => {
    expect(footprintWindow("2026-10-22")).toEqual([
      "2026-10-15",
      "2026-10-16",
      "2026-10-19",
      "2026-10-20",
      "2026-10-21",
    ]);
  });

  it("footprint window skips holidays", () => {
    // July 3 2026 (Fri) is a holiday, July 4/5 weekend.
    expect(footprintWindow("2026-07-07")).toEqual([
      "2026-06-29",
      "2026-06-30",
      "2026-07-01",
      "2026-07-02",
      "2026-07-06",
    ]);
  });

  it("baseline window is sixty trading days ending at T-6", () => {
    const base = baselineWindow("2026-10-22");
    expect(base).toHaveLength(60);
    expect(base[base.length - 1]).toBe("2026-10-14");
    expect(base[0] < base[59]).toBe(true);
    expect(new Set(base).size).toBe(60);
  });

  it("partial footprint window stops at today", () => {
    expect(partialFootprintWindow("2026-10-28", "2026-10-22")).toEqual([
      "2026-10-21",
      "2026-10-22",
    ]);
    expect(partialFootprintWindow("2026-10-28", "2026-10-20")).toEqual([]);
  });

  it("addTradingDays moves both directions", () => {
    expect(addTradingDays("2026-10-22", 1)).toBe("2026-10-23");
    expect(addTradingDays("2026-10-23", 1)).toBe("2026-10-26");
    expect(addTradingDays("2026-10-26", -1)).toBe("2026-10-23");
    expect(addTradingDays("2026-10-22", 0)).toBe("2026-10-22");
  });

  it("chart window covers T-10 .. T+3", () => {
    const w = chartWindow("2026-10-22");
    expect(w).toHaveLength(14);
    expect(w[10]).toBe("2026-10-22");
    expect(w[13]).toBe("2026-10-27");
  });

  it("upcoming trading days and ranges", () => {
    expect(upcomingTradingDays("2026-10-22", 3)).toEqual(["2026-10-23", "2026-10-26", "2026-10-27"]);
    expect(tradingDaysBetween("2026-10-23", "2026-10-27")).toEqual([
      "2026-10-23",
      "2026-10-26",
      "2026-10-27",
    ]);
  });
});

describe("todayIso", () => {
  it("uses New York's date, not UTC's", () => {
    expect(todayIso(new Date("2026-10-23T03:30:00Z"))).toBe("2026-10-22");
    expect(todayIso(new Date("2026-10-23T14:00:00Z"))).toBe("2026-10-23");
  });
});

describe("sessionStarted", () => {
  it("counts today only once the market has opened in New York", () => {
    // 3:30am and 9:29am New York (EDT) on Fri Oct 23, 2026: today hasn't traded yet.
    expect(sessionStarted("2026-10-23", new Date("2026-10-23T07:30:00Z"))).toBe(false);
    expect(sessionStarted("2026-10-23", new Date("2026-10-23T13:29:00Z"))).toBe(false);
    expect(sessionStarted("2026-10-23", new Date("2026-10-23T13:30:00Z"))).toBe(true);
    expect(sessionStarted("2026-10-22", new Date("2026-10-23T07:30:00Z"))).toBe(true);
    expect(sessionStarted("2026-10-26", new Date("2026-10-23T20:00:00Z"))).toBe(false);
  });
});

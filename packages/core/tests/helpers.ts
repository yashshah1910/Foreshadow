import type { DailyFootprint, FlowAlert, OiChange, DarkPoolPrint } from "../src/types";
import { baselineWindow, footprintWindow } from "../src/windows";

/** Tiny seeded PRNG so fixtures are reproducible across runs. */
export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface DayOptions {
  alerts?: number;
  premiumMean?: number;
  putShare?: number;
  askShare?: number;
  sweepShare?: number;
  oiChanges?: number;
  oiMean?: number;
  oiPutShare?: number;
  volumePercentile?: number;
  skew?: number;
  darkPoolPrints?: number;
  darkPoolNotional?: number;
}

let idCounter = 0;

export function makeDay(
  ticker: string,
  date: string,
  rand: () => number,
  o: DayOptions = {},
): DailyFootprint {
  const {
    alerts = 6,
    premiumMean = 60_000,
    putShare = 0.5,
    askShare = 0.5,
    sweepShare = 0.25,
    oiChanges = 8,
    oiMean = 400,
    oiPutShare = 0.5,
    volumePercentile = 50,
    skew = 0.03,
    darkPoolPrints = 1,
    darkPoolNotional = 1_500_000,
  } = o;
  const flow: FlowAlert[] = [];
  for (let i = 0; i < alerts; i++) {
    const isPut = rand() < putShare;
    flow.push({
      id: `a${++idCounter}`,
      ticker,
      tradeDate: date,
      executedAt: `${date}T14:${String(10 + i).padStart(2, "0")}:00Z`,
      type: isPut ? "put" : "call",
      strike: 100 + Math.round(rand() * 20) - 10,
      expiry: "2026-12-18",
      premium: Math.max(5_000, premiumMean * (0.5 + rand())),
      size: 50 + Math.round(rand() * 400),
      side: rand() < askShare ? "ask" : "bid",
      isSweep: rand() < sweepShare,
    });
  }
  const oi: OiChange[] = [];
  for (let i = 0; i < oiChanges; i++) {
    const isPut = rand() < oiPutShare;
    const change = Math.round(oiMean * (0.5 + rand()));
    oi.push({
      ticker,
      tradeDate: date,
      strike: 100 + i,
      expiry: "2026-12-18",
      type: isPut ? "put" : "call",
      oiChange: change,
      prevOi: 1000,
      curOi: 1000 + change,
    });
  }
  const dp: DarkPoolPrint[] = [];
  for (let i = 0; i < darkPoolPrints; i++) {
    const size = Math.round((darkPoolNotional * (0.6 + rand() * 0.8)) / 100);
    dp.push({
      id: `d${++idCounter}`,
      ticker,
      tradeDate: date,
      executedAt: `${date}T15:${String(10 + i).padStart(2, "0")}:00Z`,
      price: 100,
      size,
      notional: size * 100,
    });
  }
  return { date, alerts: flow, oiChanges: oi, volumePercentile, skew, darkPool: dp };
}

export function quietInput(ticker: string, eventDate: string, seed = 1) {
  idCounter = 0;
  const rand = mulberry32(seed);
  return {
    ticker,
    eventDate,
    baselineDays: baselineWindow(eventDate).map((d) => makeDay(ticker, d, rand)),
    footprintDays: footprintWindow(eventDate).map((d) => makeDay(ticker, d, rand)),
  };
}

export function bearishSpikeInput(ticker: string, eventDate: string, seed = 2) {
  idCounter = 0;
  const rand = mulberry32(seed);
  return {
    ticker,
    eventDate,
    baselineDays: baselineWindow(eventDate).map((d) => makeDay(ticker, d, rand)),
    footprintDays: footprintWindow(eventDate).map((d, i) =>
      makeDay(ticker, d, rand, {
        alerts: 30,
        premiumMean: 400_000,
        putShare: 0.9,
        askShare: 0.85,
        sweepShare: 0.7,
        oiChanges: 20,
        oiMean: 3_000,
        oiPutShare: 0.85,
        volumePercentile: 96,
        skew: 0.03 + 0.02 * (i + 1),
        darkPoolPrints: 4,
        darkPoolNotional: 6_000_000,
      }),
    ),
  };
}

export function bullishSpikeInput(ticker: string, eventDate: string, seed = 3) {
  idCounter = 0;
  const rand = mulberry32(seed);
  return {
    ticker,
    eventDate,
    baselineDays: baselineWindow(eventDate).map((d) => makeDay(ticker, d, rand)),
    footprintDays: footprintWindow(eventDate).map((d, i) =>
      makeDay(ticker, d, rand, {
        alerts: 28,
        premiumMean: 350_000,
        putShare: 0.1,
        askShare: 0.85,
        sweepShare: 0.65,
        oiChanges: 20,
        oiMean: 2_500,
        oiPutShare: 0.15,
        volumePercentile: 92,
        skew: 0.03 - 0.012 * (i + 1),
        darkPoolPrints: 3,
        darkPoolNotional: 5_000_000,
      }),
    ),
  };
}

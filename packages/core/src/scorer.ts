/**
 * The Foreshadow Score.
 *
 * One number per (ticker, event): 0-100, plus a direction. Deterministic -
 * no LLM anywhere in this path - so any number on a screenshot can be
 * reproduced from the same input rows.
 *
 *   Score = Σ_i  w_i · min( max(z_i, 0) / 4, 1 ) · 100
 *
 * Every signal becomes a z-score of the footprint window (T-5..T-1) against
 * the ticker's own baseline (T-65..T-6), so a sleepy biotech and SPY are
 * comparable. Dollar-denominated metrics are log1p-transformed before the
 * z-score so one mega-print can't dominate the distribution.
 */

import type {
  DailyFootprint,
  DailyMetrics,
  Direction,
  ScoreFlags,
  ScoreInput,
  ScoreResult,
  SignalBreakdown,
  SignalKey,
} from "./types";
import { largestTrades } from "./trades";

export const WEIGHTS: Record<SignalKey, number> = {
  flowIntensity: 0.25,
  directionalPremium: 0.2,
  openInterest: 0.2,
  volumeUnusualness: 0.15,
  skewShift: 0.1,
  darkPool: 0.1,
};

export const SIGNAL_LABELS: Record<SignalKey, string> = {
  flowIntensity: "Flow-alert intensity",
  directionalPremium: "Directional premium",
  openInterest: "New open interest",
  volumeUnusualness: "Volume unusualness",
  skewShift: "Skew shift",
  darkPool: "Dark pool prints",
};

export const SIGNAL_ORDER: SignalKey[] = [
  "flowIntensity",
  "directionalPremium",
  "openInterest",
  "volumeUnusualness",
  "skewShift",
  "darkPool",
];

/** z is clipped to [0, Z_CAP] before weighting. */
export const Z_CAP = 4;
/** Fewer baseline days with any options activity than this -> "insufficient history". */
export const MIN_BASELINE_DAYS = 20;
/** |directionScore| below this -> "mixed". */
export const MIXED_THRESHOLD = 0.5;
/** Dark pool prints below this notional are ignored. */
export const DARK_POOL_MIN_NOTIONAL = 1_000_000;
/** Score bands. */
export const BAND_NOTABLE = 40;
export const BAND_SOMEONE_KNEW = 70;

/**
 * Index and ETF tickers are always busy, so they never make the leaderboard.
 * They are still scored (Live Radar can show them when a user asks).
 */
export const INDEX_ETF_TICKERS: ReadonlySet<string> = new Set([
  "SPY", "QQQ", "IWM", "DIA", "VXX", "UVXY", "SVXY", "TLT", "TBT", "GLD", "SLV",
  "XLF", "XLE", "XLK", "XLV", "XLI", "XLP", "XLU", "XLY", "XLB", "XLRE", "XLC",
  "HYG", "LQD", "JNK", "EEM", "EFA", "FXI", "KWEB", "ARKK", "SQQQ", "TQQQ",
  "SOXL", "SOXS", "SMH", "SOXX", "XBI", "IBB", "GDX", "GDXJ", "USO", "UNG",
  "SPX", "SPXW", "NDX", "VIX", "RUT", "DJX", "XSP", "TNA", "TZA", "SPXL", "SPXS",
  "UPRO", "SDS", "SH", "PSQ", "QID", "XOP", "OIH", "KRE", "XHB", "XRT", "ITB",
  "IYR", "VNQ", "BITO", "IBIT", "ETHA", "FBTC", "GBTC", "EWZ", "EWJ", "EWY",
  "VTI", "VOO", "IVV", "RSP", "MDY", "IWF", "IWD", "VXUS", "BND", "AGG", "SHY",
  "IEF", "TMF", "UVIX", "VIXY", "LABU", "LABD", "NVDL", "TSLL", "MSTU", "MSTX",
]);

export type ScoreBand = "quiet" | "notable" | "someone-knew";

export function scoreBand(score: number): ScoreBand {
  if (score >= BAND_SOMEONE_KNEW) return "someone-knew";
  if (score >= BAND_NOTABLE) return "notable";
  return "quiet";
}

export function isIndexOrEtf(ticker: string): boolean {
  return INDEX_ETF_TICKERS.has(ticker.toUpperCase());
}

export function clipZ(z: number): number {
  if (!Number.isFinite(z)) return 0;
  return Math.min(Math.max(z, 0) / Z_CAP, 1);
}

export interface ZResult {
  z: number;
  mean: number;
  sd: number;
}

/**
 * z-score of `value` against the `baseline` sample. `sdFloor` prevents a
 * degenerate (near-constant) baseline from turning a small bump into an
 * infinite z. With fewer than two baseline points the z is 0: no evidence.
 */
export function zScore(value: number, baseline: number[], sdFloor = 0): ZResult {
  const n = baseline.length;
  if (n < 2) return { z: 0, mean: n === 1 ? baseline[0] : 0, sd: 0 };
  let sum = 0;
  for (const x of baseline) sum += x;
  const mean = sum / n;
  let ss = 0;
  for (const x of baseline) ss += (x - mean) * (x - mean);
  const sd = Math.sqrt(ss / (n - 1));
  const effSd = Math.max(sd, sdFloor, 1e-9);
  return { z: (value - mean) / effSd, mean, sd };
}

export function mean(xs: number[]): number {
  if (xs.length === 0) return 0;
  let s = 0;
  for (const x of xs) s += x;
  return s / xs.length;
}

export function round(x: number, decimals = 1): number {
  const f = 10 ** decimals;
  return Math.round(x * f) / f;
}

/** Collapse one trading day of raw rows into the numbers the scorer uses. */
export function dailyMetrics(day: DailyFootprint): DailyMetrics {
  let alertPremium = 0;
  let callPremium = 0;
  let putPremium = 0;
  let askCall = 0;
  let askPut = 0;
  let sweeps = 0;
  for (const a of day.alerts) {
    alertPremium += a.premium;
    if (a.type === "call") callPremium += a.premium;
    else putPremium += a.premium;
    if (a.side === "ask") {
      if (a.type === "call") askCall += a.premium;
      else askPut += a.premium;
    }
    if (a.isSweep) sweeps += 1;
  }
  let oiAbs = 0;
  let oiCall = 0;
  let oiPut = 0;
  for (const o of day.oiChanges) {
    oiAbs += Math.abs(o.oiChange);
    if (o.type === "call") oiCall += o.oiChange;
    else oiPut += o.oiChange;
  }
  let darkPoolNotional = 0;
  for (const p of day.darkPool) {
    if (p.notional >= DARK_POOL_MIN_NOTIONAL) darkPoolNotional += p.notional;
  }
  const alertCount = day.alerts.length;
  return {
    date: day.date,
    alertCount,
    alertPremium,
    callPremium,
    putPremium,
    netPremium: askCall - askPut,
    sweepShare: alertCount === 0 ? 0 : sweeps / alertCount,
    oiAbs,
    oiCallMinusPut: oiCall - oiPut,
    volumePercentile: day.volumePercentile ?? null,
    skew: day.skew ?? null,
    darkPoolNotional,
  };
}

function hasActivity(m: DailyMetrics): boolean {
  return (
    m.alertCount > 0 ||
    m.oiAbs > 0 ||
    m.darkPoolNotional > 0 ||
    m.volumePercentile !== null
  );
}

function log1p(x: number): number {
  return Math.log1p(Math.max(0, x));
}

function sortByDate<T extends { date: string }>(xs: T[]): T[] {
  return [...xs].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

export function scoreEvent(input: ScoreInput): ScoreResult {
  const footprintDays = sortByDate(input.footprintDays);
  const baselineDays = sortByDate(input.baselineDays);
  const fp = footprintDays.map(dailyMetrics);
  const base = baselineDays.map(dailyMetrics);

  // ---- 1. Flow-alert intensity (25%) -----------------------------------
  const zCount = zScore(mean(fp.map((m) => m.alertCount)), base.map((m) => m.alertCount), 1);
  const zPrem = zScore(
    mean(fp.map((m) => log1p(m.alertPremium))),
    base.map((m) => log1p(m.alertPremium)),
    0.35,
  );
  const sweepShareFp = mean(fp.filter((m) => m.alertCount > 0).map((m) => m.sweepShare));
  const sweepShareBase = mean(base.filter((m) => m.alertCount > 0).map((m) => m.sweepShare));
  const baseHasAlerts = base.some((m) => m.alertCount > 0);
  const sweepBump = baseHasAlerts ? Math.max(0, sweepShareFp - sweepShareBase) * 2 : 0;
  const zIntensity = 0.5 * (zCount.z + zPrem.z) + sweepBump;
  const premiumBase = base.map((m) => m.alertPremium);
  const premiumStats = zScore(mean(fp.map((m) => m.alertPremium)), premiumBase);
  const flowIntensity = signal("flowIntensity", {
    footprintValue: mean(fp.map((m) => m.alertPremium)),
    baselineMean: premiumStats.mean,
    baselineSd: premiumStats.sd,
    z: zIntensity,
    detail: {
      zCount: round(zCount.z, 2),
      zPremium: round(zPrem.z, 2),
      footprintAlertsPerDay: round(mean(fp.map((m) => m.alertCount)), 2),
      baselineAlertsPerDay: round(zCount.mean, 2),
      sweepShareFootprint: round(sweepShareFp, 3),
      sweepShareBaseline: round(sweepShareBase, 3),
      sweepBump: round(sweepBump, 2),
    },
  });

  // ---- 2. Directional premium (20%) ------------------------------------
  const netFp = mean(fp.map((m) => m.netPremium));
  const netBase = base.map((m) => m.netPremium);
  const zNet = zScore(netFp, netBase, 25_000);
  const directionalPremium = signal("directionalPremium", {
    footprintValue: netFp,
    baselineMean: zNet.mean,
    baselineSd: zNet.sd,
    z: Math.abs(zNet.z),
    detail: {
      signedZ: round(zNet.z, 2),
      netPremiumPerDay: round(netFp, 0),
      callPremium: round(fp.reduce((s, m) => s + m.callPremium, 0), 0),
      putPremium: round(fp.reduce((s, m) => s + m.putPremium, 0), 0),
      askSidePositiveDays: fp.filter((m) => m.netPremium > 0).length,
    },
  });

  // ---- 3. New open interest (20%) --------------------------------------
  const zOi = zScore(
    mean(fp.map((m) => log1p(m.oiAbs))),
    base.map((m) => log1p(m.oiAbs)),
    0.35,
  );
  const oiRaw = zScore(mean(fp.map((m) => m.oiAbs)), base.map((m) => m.oiAbs));
  let oiCall = 0;
  let oiPut = 0;
  for (const d of footprintDays) {
    for (const o of d.oiChanges) {
      if (o.type === "call") oiCall += o.oiChange;
      else oiPut += o.oiChange;
    }
  }
  const oiDenom = Math.abs(oiCall) + Math.abs(oiPut);
  const oiImbalance = oiDenom === 0 ? 0 : (oiCall - oiPut) / oiDenom;
  const openInterest = signal("openInterest", {
    footprintValue: mean(fp.map((m) => m.oiAbs)),
    baselineMean: oiRaw.mean,
    baselineSd: oiRaw.sd,
    z: zOi.z,
    detail: {
      callOiChange: oiCall,
      putOiChange: oiPut,
      imbalance: round(oiImbalance, 3),
    },
  });

  // ---- 4. Volume unusualness (15%) -------------------------------------
  const fpPct = fp.filter((m) => m.volumePercentile !== null).map((m) => m.volumePercentile as number);
  const basePct = base.filter((m) => m.volumePercentile !== null).map((m) => m.volumePercentile as number);
  const pct = fpPct.length ? mean(fpPct) : 0;
  const pctStats = zScore(pct, basePct);
  const volumeUnusualness = signal("volumeUnusualness", {
    footprintValue: pct,
    baselineMean: pctStats.mean,
    baselineSd: pctStats.sd,
    // The endpoint already returns a percentile: map 0..100 linearly onto 0..Z_CAP.
    z: fpPct.length ? (pct / 100) * Z_CAP : 0,
    detail: {
      daysWithData: fpPct.length,
      maxPercentile: fpPct.length ? Math.max(...fpPct) : 0,
    },
  });

  // ---- 5. Skew shift (10%) ---------------------------------------------
  const skewSeries = [...base, ...fp]
    .filter((m) => m.skew !== null)
    .map((m) => ({ date: m.date, skew: m.skew as number }));
  const fpSkew = fp.filter((m) => m.skew !== null).map((m) => m.skew as number);
  const baseSkew = base.filter((m) => m.skew !== null).map((m) => m.skew as number);
  let skewShiftValue = 0;
  let skewStart = 0;
  let skewEnd = 0;
  if (fpSkew.length >= 1 && (baseSkew.length >= 1 || fpSkew.length >= 2)) {
    skewStart = baseSkew.length ? baseSkew[baseSkew.length - 1] : fpSkew[0];
    skewEnd = fpSkew[fpSkew.length - 1];
    skewShiftValue = skewEnd - skewStart;
  }
  const lag = Math.max(1, Math.min(fp.length || 1, 5));
  const baseShifts: number[] = [];
  for (let i = lag; i < baseSkew.length; i++) baseShifts.push(baseSkew[i] - baseSkew[i - lag]);
  const zSkew = zScore(skewShiftValue, baseShifts, 0.005);
  const skewShift = signal("skewShift", {
    footprintValue: skewShiftValue,
    baselineMean: zSkew.mean,
    baselineSd: zSkew.sd,
    z: Math.abs(zSkew.z),
    detail: {
      signedZ: round(zSkew.z, 2),
      skewStart: round(skewStart, 4),
      skewEnd: round(skewEnd, 4),
      points: skewSeries.length,
    },
  });

  // ---- 6. Dark pool prints (10%) ---------------------------------------
  const zDp = zScore(
    mean(fp.map((m) => log1p(m.darkPoolNotional))),
    base.map((m) => log1p(m.darkPoolNotional)),
    0.35,
  );
  const dpRaw = zScore(mean(fp.map((m) => m.darkPoolNotional)), base.map((m) => m.darkPoolNotional));
  const darkPool = signal("darkPool", {
    footprintValue: mean(fp.map((m) => m.darkPoolNotional)),
    baselineMean: dpRaw.mean,
    baselineSd: dpRaw.sd,
    z: zDp.z,
    detail: {
      printsOver1M: footprintDays.reduce(
        (s, d) => s + d.darkPool.filter((p) => p.notional >= DARK_POOL_MIN_NOTIONAL).length,
        0,
      ),
      totalNotional: round(fp.reduce((s, m) => s + m.darkPoolNotional, 0), 0),
    },
  });

  const signals: SignalBreakdown[] = [
    flowIntensity,
    directionalPremium,
    openInterest,
    volumeUnusualness,
    skewShift,
    darkPool,
  ];
  if (fp.length === 0) {
    for (const s of signals) {
      s.z = 0;
      s.clipped = 0;
      s.contribution = 0;
    }
  }
  const total = signals.reduce((s, x) => s + x.contribution, 0);

  // ---- Direction --------------------------------------------------------
  // Positive = bullish. Rising put skew (positive shift) argues bearish.
  const directionScore = fp.length === 0 ? 0 : zNet.z + 2 * oiImbalance - zSkew.z;
  let direction: Direction = "mixed";
  if (directionScore > MIXED_THRESHOLD) direction = "bullish";
  else if (directionScore < -MIXED_THRESHOLD) direction = "bearish";

  // ---- Flags ------------------------------------------------------------
  const baselineDaysWithActivity = base.filter(hasActivity).length;
  const flags: ScoreFlags = {
    insufficientHistory: baselineDaysWithActivity < MIN_BASELINE_DAYS,
    baselineDaysWithActivity,
    isIndexOrEtf: isIndexOrEtf(input.ticker),
    multiCatalyst: (input.otherCatalystsInWindow ?? 0) > 0,
    partialWindow: Boolean(input.partialWindow),
    footprintDaysUsed: fp.length,
  };

  // ---- Top alerts -------------------------------------------------------
  const topAlerts = largestTrades(footprintDays.flatMap((d) => d.alerts), 5);

  return {
    ticker: input.ticker.toUpperCase(),
    eventDate: input.eventDate,
    score: round(Math.min(100, Math.max(0, total)), 1),
    direction,
    directionScore: round(directionScore, 3),
    signals,
    flags,
    topAlerts,
    daily: [...base, ...fp],
  };
}

function signal(
  key: SignalKey,
  v: {
    footprintValue: number;
    baselineMean: number;
    baselineSd: number;
    z: number;
    detail: Record<string, number>;
  },
): SignalBreakdown {
  const clipped = clipZ(v.z);
  return {
    key,
    label: SIGNAL_LABELS[key],
    weight: WEIGHTS[key],
    footprintValue: round(v.footprintValue, 4),
    baselineMean: round(v.baselineMean, 4),
    baselineSd: round(v.baselineSd, 4),
    z: round(Number.isFinite(v.z) ? v.z : 0, 3),
    clipped: round(clipped, 4),
    contribution: round(WEIGHTS[key] * clipped * 100, 2),
    detail: v.detail,
  };
}

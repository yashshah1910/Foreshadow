/**
 * Generates the demo dataset: a fictional universe of tickers and catalysts
 * with synthetic Unusual Whales-shaped footprints, scored by the real
 * scorer. Output:
 *
 *   supabase/fixtures/meta.json            { today, generatedAt, seed, hero }
 *   supabase/fixtures/companies.json       fictional companies
 *   supabase/fixtures/catalysts.json       Catalyst[]
 *   supabase/fixtures/scores.json          StoredScore[] (breakdown + verdict)
 *   supabase/fixtures/footprints/{T}.json  { ticker, days: DailyFootprint[] }
 *   supabase/fixtures/ohlc/{T}.json        OhlcBar[]
 *   supabase/seed.sql                      the same rows as SQL
 *
 * Everything is deterministic for a fixed seed. Nothing here is real market
 * data: tickers, companies, dates and prints are invented so the product can
 * be demoed without a UW key. Add a key and the ingest route replaces it.
 *
 * Run: pnpm seed:generate
 */

import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import {
  addTradingDays,
  baselineWindow,
  computeVerdict,
  footprintWindow,
  partialFootprintWindow,
  scoreBand,
  scoreEvent,
  tradingDaysBetween,
  nextTradingDay,
  isTradingDay,
  type Catalyst,
  type CatalystSession,
  type DailyFootprint,
  type DarkPoolPrint,
  type FlowAlert,
  type OhlcBar,
  type OiChange,
  type StoredScore,
} from "../packages/core/src/index";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const SEED = 20261022;
const TODAY = "2026-10-22";
const OUT = join(process.cwd(), "supabase", "fixtures");

interface Company {
  ticker: string;
  name: string;
  sector: string;
  price: number;
  vol: number; // annualized
  alertsPerDay: number;
  premiumScale: number;
  oiRows: number;
  oiScale: number;
  dpPerDay: number;
  baseSkew: number;
  marketcap: number;
}

const COMPANIES: Company[] = [
  // biotech (FDA calendar)
  { ticker: "VXRA", name: "Vexara Therapeutics", sector: "Healthcare", price: 42, vol: 0.95, alertsPerDay: 1.2, premiumScale: 35_000, oiRows: 3, oiScale: 220, dpPerDay: 0.5, baseSkew: 0.06, marketcap: 2.1e9 },
  { ticker: "CLNB", name: "Celanta Bio", sector: "Healthcare", price: 18, vol: 1.1, alertsPerDay: 0.8, premiumScale: 22_000, oiRows: 2, oiScale: 150, dpPerDay: 0.15, baseSkew: 0.07, marketcap: 9e8 },
  { ticker: "ORYX", name: "Oryx Neuroscience", sector: "Healthcare", price: 67, vol: 0.85, alertsPerDay: 1.6, premiumScale: 48_000, oiRows: 3, oiScale: 300, dpPerDay: 0.4, baseSkew: 0.05, marketcap: 4.4e9 },
  { ticker: "HLXB", name: "Helixbright Medicines", sector: "Healthcare", price: 29, vol: 1.0, alertsPerDay: 1.0, premiumScale: 28_000, oiRows: 3, oiScale: 180, dpPerDay: 0.2, baseSkew: 0.065, marketcap: 1.5e9 },
  { ticker: "AZTH", name: "Azoth Pharma", sector: "Healthcare", price: 11, vol: 1.2, alertsPerDay: 0.6, premiumScale: 15_000, oiRows: 2, oiScale: 120, dpPerDay: 0.1, baseSkew: 0.08, marketcap: 6e8 },
  { ticker: "MYRB", name: "Myrobalan Therapeutics", sector: "Healthcare", price: 54, vol: 0.8, alertsPerDay: 1.4, premiumScale: 40_000, oiRows: 3, oiScale: 260, dpPerDay: 0.35, baseSkew: 0.05, marketcap: 3.2e9 },
  { ticker: "KRYO", name: "Kryos Genomics", sector: "Healthcare", price: 23, vol: 1.05, alertsPerDay: 0.9, premiumScale: 24_000, oiRows: 2, oiScale: 160, dpPerDay: 0.2, baseSkew: 0.07, marketcap: 1.1e9 },
  { ticker: "PLSB", name: "Pulsebio", sector: "Healthcare", price: 88, vol: 0.7, alertsPerDay: 2.0, premiumScale: 60_000, oiRows: 4, oiScale: 380, dpPerDay: 0.6, baseSkew: 0.045, marketcap: 7.8e9 },
  { ticker: "ZENT", name: "Zenthera", sector: "Healthcare", price: 15, vol: 1.15, alertsPerDay: 0.7, premiumScale: 18_000, oiRows: 2, oiScale: 130, dpPerDay: 0.1, baseSkew: 0.075, marketcap: 7e8 },
  // tech
  { ticker: "QNTM", name: "Quantim Systems", sector: "Technology", price: 312, vol: 0.55, alertsPerDay: 4.5, premiumScale: 180_000, oiRows: 6, oiScale: 1400, dpPerDay: 2.2, baseSkew: 0.03, marketcap: 2.4e11 },
  { ticker: "LUMX", name: "Lumex Photonics", sector: "Technology", price: 96, vol: 0.6, alertsPerDay: 3.2, premiumScale: 90_000, oiRows: 5, oiScale: 700, dpPerDay: 1.1, baseSkew: 0.035, marketcap: 3.8e10 },
  { ticker: "NVRA", name: "Nivara Compute", sector: "Technology", price: 148, vol: 0.62, alertsPerDay: 3.6, premiumScale: 140_000, oiRows: 5, oiScale: 1100, dpPerDay: 1.8, baseSkew: 0.03, marketcap: 1.3e11 },
  { ticker: "DRFT", name: "Drift Robotics", sector: "Technology", price: 38, vol: 0.75, alertsPerDay: 2.4, premiumScale: 55_000, oiRows: 4, oiScale: 420, dpPerDay: 0.7, baseSkew: 0.045, marketcap: 9e9 },
  { ticker: "SYNQ", name: "Synqa Cloud", sector: "Technology", price: 71, vol: 0.58, alertsPerDay: 3.0, premiumScale: 80_000, oiRows: 5, oiScale: 600, dpPerDay: 1.0, baseSkew: 0.035, marketcap: 2.6e10 },
  { ticker: "OPTA", name: "Optara Semiconductor", sector: "Technology", price: 124, vol: 0.65, alertsPerDay: 4.1, premiumScale: 120_000, oiRows: 6, oiScale: 900, dpPerDay: 1.5, baseSkew: 0.032, marketcap: 7.2e10 },
  { ticker: "VELO", name: "Velocity Networks", sector: "Communication", price: 52, vol: 0.5, alertsPerDay: 2.1, premiumScale: 50_000, oiRows: 4, oiScale: 380, dpPerDay: 0.8, baseSkew: 0.04, marketcap: 1.4e10 },
  { ticker: "CRBN", name: "Carbonix Materials", sector: "Materials", price: 27, vol: 0.7, alertsPerDay: 1.5, premiumScale: 38_000, oiRows: 3, oiScale: 260, dpPerDay: 0.4, baseSkew: 0.05, marketcap: 4e9 },
  // consumer / industrial / financial / energy
  { ticker: "HLDN", name: "Holden Outfitters", sector: "Consumer", price: 63, vol: 0.48, alertsPerDay: 2.0, premiumScale: 45_000, oiRows: 4, oiScale: 350, dpPerDay: 0.6, baseSkew: 0.04, marketcap: 1.1e10 },
  { ticker: "FRGO", name: "Fargo Freight", sector: "Industrials", price: 44, vol: 0.45, alertsPerDay: 1.6, premiumScale: 40_000, oiRows: 3, oiScale: 300, dpPerDay: 0.5, baseSkew: 0.04, marketcap: 8e9 },
  { ticker: "MRCT", name: "Mercato Grocers", sector: "Consumer", price: 35, vol: 0.4, alertsPerDay: 1.3, premiumScale: 32_000, oiRows: 3, oiScale: 240, dpPerDay: 0.5, baseSkew: 0.045, marketcap: 6e9 },
  { ticker: "ARLN", name: "Arlen Foods", sector: "Consumer", price: 58, vol: 0.38, alertsPerDay: 1.4, premiumScale: 36_000, oiRows: 3, oiScale: 260, dpPerDay: 0.5, baseSkew: 0.04, marketcap: 9e9 },
  { ticker: "TBLT", name: "Tablet Air", sector: "Industrials", price: 21, vol: 0.6, alertsPerDay: 1.2, premiumScale: 28_000, oiRows: 3, oiScale: 220, dpPerDay: 0.3, baseSkew: 0.055, marketcap: 3e9 },
  { ticker: "KPTL", name: "Keystone Capital", sector: "Financials", price: 82, vol: 0.42, alertsPerDay: 2.2, premiumScale: 55_000, oiRows: 4, oiScale: 400, dpPerDay: 0.9, baseSkew: 0.038, marketcap: 2.2e10 },
  { ticker: "BRDG", name: "Bridgewater Trust", sector: "Financials", price: 47, vol: 0.4, alertsPerDay: 1.5, premiumScale: 38_000, oiRows: 3, oiScale: 280, dpPerDay: 0.6, baseSkew: 0.04, marketcap: 7e9 },
  { ticker: "SOLV", name: "Solvent Energy", sector: "Energy", price: 33, vol: 0.55, alertsPerDay: 1.7, premiumScale: 42_000, oiRows: 3, oiScale: 300, dpPerDay: 0.5, baseSkew: 0.045, marketcap: 5e9 },
  { ticker: "HYDR", name: "Hydra Power", sector: "Energy", price: 19, vol: 0.65, alertsPerDay: 1.1, premiumScale: 26_000, oiRows: 3, oiScale: 200, dpPerDay: 0.3, baseSkew: 0.05, marketcap: 2.5e9 },
  { ticker: "AERO", name: "Aerolith Defense", sector: "Defense", price: 109, vol: 0.44, alertsPerDay: 2.6, premiumScale: 70_000, oiRows: 4, oiScale: 450, dpPerDay: 0.9, baseSkew: 0.035, marketcap: 3.1e10 },
  // the index, kept off the leaderboard
  { ticker: "SPY", name: "S&P 500 ETF", sector: "Macro", price: 612, vol: 0.16, alertsPerDay: 7, premiumScale: 400_000, oiRows: 6, oiScale: 6000, dpPerDay: 3, baseSkew: 0.045, marketcap: 6e11 },
];

const byTicker = new Map(COMPANIES.map((c) => [c.ticker, c]));

// ---------------------------------------------------------------------------
// PRNG + helpers
// ---------------------------------------------------------------------------

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(SEED);
const U = (a: number, b: number) => a + (b - a) * rand();
const N = (mean = 0, sd = 1) => {
  const u = 1 - rand();
  const v = rand();
  return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
};
const poisson = (lambda: number) => {
  const L = Math.exp(-lambda);
  let k = 0;
  let p = 1;
  do {
    k++;
    p *= rand();
  } while (p > L);
  return k - 1;
};
const pick = <T,>(xs: T[]) => xs[Math.floor(rand() * xs.length)];
let idSeq = 0;
const nextId = (prefix: string) => `${prefix}_${(++idSeq).toString(36)}`;

function roundStrike(x: number): number {
  const step = x < 25 ? 0.5 : x < 100 ? 1 : x < 250 ? 2.5 : 5;
  return Math.round(x / step) * step;
}

/** Fridays on/after a date (weekly expiries). */
function fridaysAfter(date: string, n: number): string[] {
  const out: string[] = [];
  let cur = date;
  while (out.length < n) {
    cur = addCalendar(cur, 1);
    const d = new Date(cur + "T00:00:00Z").getUTCDay();
    if (d === 5) out.push(cur);
  }
  return out;
}
function addCalendar(date: string, n: number): string {
  const d = new Date(date + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}


// ---------------------------------------------------------------------------
// Readable titles
// ---------------------------------------------------------------------------

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
function fdaTitle(drug: string, catalyst: string): string {
  return catalyst.startsWith("PDUFA") ? `${cap(drug)} PDUFA decision` : `${cap(drug)} advisory committee`;
}
function earningsTitle(q: number, session: CatalystSession): string {
  return `Q${q} earnings, ${session === "afterhours" ? "after the close" : "before the open"}`;
}
function shortRange(amount: string): string {
  const k = (n: string) => {
    const v = Number(n.replace(/[$,]/g, ""));
    return v >= 1e6 ? `$${v / 1e6}M` : `$${Math.round(v / 1e3)}K`;
  };
  const [a, b] = amount.split(" - ");
  return b ? `${k(a)}–${k(b)}` : amount;
}
function shortTitle(t: string): string {
  const map: Record<string, string> = {
    "Chief Executive Officer": "CEO",
    "Chief Financial Officer": "CFO",
    "Chief Operating Officer": "COO",
    Director: "A director",
    "10% Owner": "A 10% owner",
  };
  return map[t] ?? t;
}

// ---------------------------------------------------------------------------
// Catalyst universe
// ---------------------------------------------------------------------------

interface Plan {
  catalyst: Catalyst;
  /** 0..1 how much informed positioning precedes the event. */
  informed: number;
  /** Intended direction of the informed footprint (+1 bullish, -1 bearish). */
  dir: 1 | -1;
  impliedMovePct: number;
  /** For hand-tuned events: a fixed realized move. */
  forcedMovePct?: number;
}

const plans: Plan[] = [];

function addPlan(p: Omit<Plan, "catalyst"> & { catalyst: Omit<Catalyst, "id" | "source"> & { source?: string } }) {
  const c = p.catalyst;
  const slug = c.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 40);
  const id = `${c.kind}:${c.ticker}:${c.eventDate}:${slug}`;
  plans.push({ ...p, catalyst: { ...c, id, source: c.source ?? "seed" } });
}

function informedDraw(): number {
  const r = rand();
  if (r < 0.5) return U(0, 0.25);
  if (r < 0.82) return U(0.3, 0.62);
  return U(0.64, 0.78);
}

// --- FDA (PDUFA / AdCom) -------------------------------------------------
const drugs: Record<string, [string, string, string]> = {
  VXRA: ["vexarotene", "PDUFA Date", "Relapsed small-cell lung cancer"],
  CLNB: ["celantumab", "PDUFA Date", "Moderate-to-severe ulcerative colitis"],
  ORYX: ["oryzapine", "Advisory Committee Meeting", "Treatment-resistant depression"],
  HLXB: ["helixovir", "PDUFA Date", "Chronic hepatitis D"],
  AZTH: ["azothimod", "PDUFA Date", "Myasthenia gravis"],
  MYRB: ["myrbanitide", "PDUFA Date", "Obesity with cardiovascular risk"],
  KRYO: ["kryogene-T", "Advisory Committee Meeting", "Sickle cell disease"],
  PLSB: ["pulsatinib", "PDUFA Date", "HER2+ metastatic breast cancer"],
  ZENT: ["zentherapine", "PDUFA Date", "Postpartum depression"],
};
const fdaPast: [string, string][] = [
  ["VXRA", "2026-09-18"], // hero
  ["CLNB", "2026-08-07"],
  ["ORYX", "2026-08-27"],
  ["HLXB", "2026-09-30"],
  ["AZTH", "2026-07-31"],
  ["MYRB", "2026-10-09"],
];
for (const [t, d] of fdaPast) {
  const [drug, catalyst, indication] = drugs[t];
  const hero = t === "VXRA";
  addPlan({
    catalyst: {
      ticker: t,
      kind: "fda",
      eventDate: d,
      session: "premarket",
      title: fdaTitle(drug, catalyst),
      payload: { drug, catalyst, indication, status: catalyst.startsWith("PDUFA") ? "NDA" : "AdCom", marketcap: byTicker.get(t)!.marketcap },
    },
    informed: hero ? 1 : informedDraw(),
    dir: hero ? -1 : rand() < 0.5 ? 1 : -1,
    impliedMovePct: hero ? 14.2 : U(12, 32),
    forcedMovePct: hero ? -19.4 : undefined,
  });
}
const fdaUpcoming: [string, string][] = [
  ["KRYO", "2026-10-29"],
  ["PLSB", "2026-11-03"],
  ["ZENT", "2026-10-27"],
];
for (const [t, d] of fdaUpcoming) {
  const [drug, catalyst, indication] = drugs[t];
  addPlan({
    catalyst: {
      ticker: t,
      kind: "fda",
      eventDate: d,
      session: "premarket",
      title: fdaTitle(drug, catalyst),
      payload: { drug, catalyst, indication, status: "NDA", marketcap: byTicker.get(t)!.marketcap },
    },
    informed: t === "KRYO" ? 0.8 : t === "ZENT" ? 0.55 : 0.2,
    dir: t === "KRYO" ? 1 : -1,
    impliedMovePct: U(14, 30),
  });
}

// --- Earnings ------------------------------------------------------------
const earningsPast: [string, string, CatalystSession][] = [
  ["QNTM", "2026-08-26", "afterhours"],
  ["LUMX", "2026-08-05", "afterhours"],
  ["NVRA", "2026-08-19", "afterhours"],
  ["DRFT", "2026-07-29", "afterhours"],
  ["SYNQ", "2026-09-10", "afterhours"],
  ["OPTA", "2026-07-28", "afterhours"],
  ["VELO", "2026-08-12", "premarket"],
  ["CRBN", "2026-08-04", "premarket"],
  ["HLDN", "2026-09-03", "premarket"],
  ["FRGO", "2026-07-30", "premarket"],
  ["MRCT", "2026-09-17", "premarket"],
  ["ARLN", "2026-08-20", "premarket"],
  ["TBLT", "2026-08-06", "afterhours"],
  ["KPTL", "2026-10-14", "premarket"],
  ["BRDG", "2026-10-15", "premarket"],
  ["SOLV", "2026-08-13", "afterhours"],
  ["HYDR", "2026-08-11", "afterhours"],
  ["AERO", "2026-10-20", "premarket"],
  ["OPTA", "2026-10-21", "afterhours"],
  ["NVRA", "2026-10-20", "afterhours"],
];
const strongEarnings = new Set(["QNTM:2026-08-26", "SYNQ:2026-09-10", "HLDN:2026-09-03", "AERO:2026-10-20", "NVRA:2026-10-20"]);
for (const [t, d, session] of earningsPast) {
  const key = `${t}:${d}`;
  const strong = strongEarnings.has(key);
  const implied = U(4.5, 11);
  addPlan({
    catalyst: {
      ticker: t,
      kind: "earnings",
      eventDate: d,
      session,
      title: earningsTitle(3, session),
      payload: { expected_move_perc: Math.round(implied * 100) / 100, full_name: byTicker.get(t)!.name, sector: byTicker.get(t)!.sector, marketcap: byTicker.get(t)!.marketcap, is_s_p_500: byTicker.get(t)!.marketcap > 1e10 },
    },
    informed: strong ? U(0.6, 0.74) : informedDraw(),
    dir: rand() < 0.5 ? 1 : -1,
    impliedMovePct: implied,
  });
}
// Repeat offenders: QNTM, LUMX and SYNQ get two years of quarterly history.
const repeatHistory: Record<string, { dates: string[]; informed: number[]; dirs: (1 | -1)[] }> = {
  QNTM: {
    dates: ["2024-11-20", "2025-02-26", "2025-05-28", "2025-08-27", "2025-11-19", "2026-02-25", "2026-05-27"],
    informed: [0.78, 0.2, 0.74, 0.81, 0.35, 0.76, 0.12],
    dirs: [1, -1, 1, 1, 1, -1, 1],
  },
  LUMX: {
    dates: ["2024-11-06", "2025-02-05", "2025-05-07", "2025-08-06", "2025-11-05", "2026-02-04", "2026-05-06"],
    informed: [0.15, 0.3, 0.68, 0.18, 0.4, 0.22, 0.55],
    dirs: [1, -1, -1, 1, 1, -1, 1],
  },
  SYNQ: {
    dates: ["2024-12-04", "2025-03-05", "2025-06-04", "2025-09-10", "2025-12-03", "2026-03-04", "2026-06-03"],
    informed: [0.7, 0.75, 0.2, 0.72, 0.25, 0.8, 0.3],
    dirs: [-1, -1, 1, -1, 1, -1, 1],
  },
};
for (const [t, h] of Object.entries(repeatHistory)) {
  h.dates.forEach((d, i) => {
    const implied = U(5, 10);
    const q = ((Math.floor((Number(d.slice(5, 7)) - 1) / 3) + 2) % 4) + 1;
    addPlan({
      catalyst: {
        ticker: t,
        kind: "earnings",
        eventDate: d,
        session: "afterhours",
        title: earningsTitle(q, "afterhours"),
        payload: { expected_move_perc: Math.round(implied * 100) / 100, full_name: byTicker.get(t)!.name, sector: byTicker.get(t)!.sector, marketcap: byTicker.get(t)!.marketcap, is_s_p_500: true },
      },
      informed: h.informed[i],
      dir: h.dirs[i],
      impliedMovePct: implied,
    });
  });
}
const earningsUpcoming: [string, string, CatalystSession, number, 1 | -1][] = [
  ["LUMX", "2026-10-28", "afterhours", 0.76, 1],
  ["QNTM", "2026-11-04", "afterhours", 0.35, 1],
  ["SYNQ", "2026-10-29", "afterhours", 0.62, -1],
  ["HLDN", "2026-11-03", "premarket", 0.18, 1],
  ["DRFT", "2026-10-27", "afterhours", 0.5, -1],
  ["VELO", "2026-10-30", "premarket", 0.12, 1],
  ["SOLV", "2026-11-05", "afterhours", 0.3, -1],
  ["MRCT", "2026-10-23", "premarket", 0.4, 1],
];
for (const [t, d, session, informed, dir] of earningsUpcoming) {
  const implied = U(4.5, 10);
  addPlan({
    catalyst: {
      ticker: t,
      kind: "earnings",
      eventDate: d,
      session,
      title: earningsTitle(3, session),
      payload: { expected_move_perc: Math.round(implied * 100) / 100, full_name: byTicker.get(t)!.name, sector: byTicker.get(t)!.sector, marketcap: byTicker.get(t)!.marketcap, is_s_p_500: byTicker.get(t)!.marketcap > 1e10 },
    },
    informed,
    dir,
    impliedMovePct: implied,
  });
}

// --- Congress --------------------------------------------------------------
const politicians = ["Rep. Dana Whitlock", "Sen. Marcus Hale", "Rep. Priya Anand", "Sen. Teodor Vance", "Rep. Lila Okafor"];
const congress: [string, string, string, string][] = [
  ["AERO", "2026-09-22", "Buy", "$100,001 - $250,000"],
  ["OPTA", "2026-08-28", "Buy", "$50,001 - $100,000"],
  ["HYDR", "2026-09-08", "Sell", "$15,001 - $50,000"],
  ["KPTL", "2026-10-01", "Buy", "$250,001 - $500,000"],
  ["SOLV", "2026-07-27", "Buy", "$15,001 - $50,000"],
  ["NVRA", "2026-09-29", "Sell", "$100,001 - $250,000"],
];
for (const [t, d, txn, amount] of congress) {
  const who = pick(politicians);
  const tags = rand() < 0.5 ? ["committee_conflict"] : [];
  addPlan({
    catalyst: {
      ticker: t,
      kind: "congress",
      eventDate: d,
      session: "unknown",
      title: `${who} ${txn === "Buy" ? "bought" : "sold"} ${shortRange(amount)}`,
      payload: { name: who, txn_type: txn, amounts: amount, member_type: who.startsWith("Sen") ? "senate" : "house", filed_at_date: addCalendar(d, 20 + Math.floor(rand() * 20)), tags },
    },
    informed: txn === "Buy" ? U(0.3, 0.75) : U(0.1, 0.5),
    dir: txn === "Buy" ? 1 : -1,
    impliedMovePct: U(2.5, 4),
  });
}

// --- Insider ---------------------------------------------------------------
const insiders: [string, string, string, string, "P" | "S", number][] = [
  ["CRBN", "2026-09-15", "J. Marchetti", "Chief Executive Officer", "P", 1.8e6],
  ["TBLT", "2026-08-25", "R. Okonkwo", "Director", "P", 1.1e6],
  ["FRGO", "2026-09-24", "S. Lindqvist", "Chief Financial Officer", "S", 3.4e6],
  ["ARLN", "2026-10-06", "M. Deluca", "10% Owner", "P", 5.2e6],
  ["BRDG", "2026-08-18", "A. Petrov", "Chief Operating Officer", "S", 2.2e6],
  ["LUMX", "2026-10-13", "H. Nakamura", "Director", "P", 2.9e6],
];
for (const [t, d, owner, title, code, value] of insiders) {
  addPlan({
    catalyst: {
      ticker: t,
      kind: "insider",
      eventDate: d,
      session: "unknown",
      title: `${shortTitle(title)} ${code === "P" ? "bought" : "sold"} $${(value / 1e6).toFixed(1)}M of stock`,
      payload: { owner_name: owner, officer_title: title, transaction_code: code, value, formtype: "4", filing_date: addCalendar(d, 2), is_10b5_1: code === "S" && rand() < 0.5 },
    },
    informed: code === "P" ? U(0.35, 0.8) : U(0.05, 0.4),
    dir: code === "P" ? 1 : -1,
    impliedMovePct: U(2.5, 4),
  });
}

// --- Macro (SPY, kept off the leaderboard) -------------------------------
addPlan({
  catalyst: { ticker: "SPY", kind: "economic", eventDate: "2026-09-17", session: "intraday", title: "FOMC rate decision", payload: { type: "fomc", event: "FOMC Rate Decision" } },
  informed: 0.4,
  dir: 1,
  impliedMovePct: 1.2,
});
addPlan({
  catalyst: { ticker: "SPY", kind: "economic", eventDate: "2026-10-28", session: "intraday", title: "FOMC rate decision", payload: { type: "fomc", event: "FOMC Rate Decision" } },
  informed: 0.5,
  dir: -1,
  impliedMovePct: 1.1,
});

// ---------------------------------------------------------------------------
// Footprint generation
// ---------------------------------------------------------------------------

interface DayShape {
  /** informed intensity 0..1 */
  i: number;
  dir: 1 | -1 | 0;
  /** 1..5 position inside the footprint window (5 = T-1) */
  pos: number;
  /** post-event hangover multiplier */
  post: number;
  eventDate?: string;
}

function genDay(c: Company, date: string, price: number, shape: DayShape): DailyFootprint {
  const { i, dir, pos, post } = shape;
  const ramp = 0.55 + 0.45 * (pos / 5);
  const bearish = dir === -1 ? 1 : 0;
  const bullish = dir === 1 ? 1 : 0;
  const alertsLambda = c.alertsPerDay * (1 + 3.2 * i * i * ramp + 0.6 * i) * (1 + 1.2 * post) * U(0.75, 1.25);
  const premiumMean = c.premiumScale * (1 + 4.5 * i * i * ramp + 0.5 * i) * (1 + 0.8 * post);
  const putShare = Math.min(0.95, Math.max(0.05, 0.5 + 0.4 * i * i * (bearish - bullish) + 0.08 * i * (bearish - bullish) + N(0, 0.06)));
  const askShare = Math.min(0.95, 0.5 + 0.32 * i * i + 0.06 * i + N(0, 0.05));
  const sweepShare = Math.min(0.95, 0.25 + 0.45 * i * i + 0.08 * i + N(0, 0.05));
  const expiries = fridaysAfter(shape.eventDate ?? date, 4);
  const alerts: FlowAlert[] = [];
  const n = poisson(alertsLambda);
  for (let k = 0; k < n; k++) {
    const isPut = rand() < putShare;
    const otm = U(0.02, 0.16) * (i > 0.5 && rand() < 0.6 ? 0.6 : 1);
    const strike = roundStrike(price * (isPut ? 1 - otm : 1 + otm));
    const premium = Math.max(8_000, premiumMean * Math.exp(N(0, 0.7)));
    const optPrice = Math.max(0.15, price * U(0.015, 0.07));
    const size = Math.max(5, Math.round(premium / (optPrice * 100)));
    const informedExpiry = i > 0.45 && rand() < 0.7;
    const expiry = informedExpiry ? expiries[rand() < 0.7 ? 0 : 1] : pick(expiries);
    const hour = 13 + Math.floor(rand() * 7);
    const minute = Math.floor(rand() * 60);
    alerts.push({
      id: nextId("fa"),
      ticker: c.ticker,
      tradeDate: date,
      executedAt: `${date}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:${String(Math.floor(rand() * 60)).padStart(2, "0")}Z`,
      type: isPut ? "put" : "call",
      strike,
      expiry,
      premium: Math.round(premium),
      size,
      side: rand() < askShare ? "ask" : rand() < 0.8 ? "bid" : "mid",
      isSweep: rand() < sweepShare,
      volume: size + Math.round(size * U(0.2, 3)),
      openInterest: Math.round(size * U(0.1, 2.5)),
      underlyingPrice: Math.round(price * 100) / 100,
      rule: rand() < sweepShare ? "RepeatedHits" : pick(["RepeatedHitsAscendingFill", "FloorTradeMidCap", "OtmEarningsFloor", "LowHistoricVolumeFloor"]),
    });
  }
  alerts.sort((a, b) => (a.executedAt < b.executedAt ? -1 : 1));

  const oiChanges: OiChange[] = [];
  const rows = Math.max(1, Math.round(c.oiRows * (1 + 1.8 * i * i * ramp + 0.3 * i) * U(0.7, 1.3)));
  const oiPutShare = Math.min(0.95, Math.max(0.05, 0.5 + 0.38 * i * i * (bearish - bullish) + 0.06 * i * (bearish - bullish) + N(0, 0.08)));
  for (let k = 0; k < rows; k++) {
    const isPut = rand() < oiPutShare;
    const otm = U(0.02, 0.18);
    const strike = roundStrike(price * (isPut ? 1 - otm : 1 + otm));
    const change = Math.round(c.oiScale * (1 + 4 * i * i * ramp + 0.5 * i) * Math.exp(N(0, 0.6)) * (rand() < 0.12 ? -0.4 : 1));
    const prev = Math.round(c.oiScale * U(0.5, 4));
    oiChanges.push({ ticker: c.ticker, tradeDate: date, strike, expiry: pick(expiries.slice(0, 3)), type: isPut ? "put" : "call", oiChange: change, prevOi: prev, curOi: Math.max(0, prev + change) });
  }

  const darkPool: DarkPoolPrint[] = [];
  const prints = poisson(c.dpPerDay * (1 + 1.5 * i * i * ramp + 0.3 * i) * (1 + post));
  for (let k = 0; k < prints; k++) {
    const notional = 1_000_000 * Math.exp(U(0, 1.6)) * (1 + 2 * i * i);
    const px = Math.round(price * U(0.995, 1.005) * 100) / 100;
    const size = Math.round(notional / px);
    darkPool.push({ id: nextId("dp"), ticker: c.ticker, tradeDate: date, executedAt: `${date}T${String(14 + Math.floor(rand() * 6)).padStart(2, "0")}:${String(Math.floor(rand() * 60)).padStart(2, "0")}:00Z`, price: px, size, notional: Math.round(size * px) });
  }

  const volumePercentile = Math.min(99, Math.max(1, Math.round(U(18, 72) + 42 * i * i * ramp + 8 * i + 12 * post)));
  const skew = Math.round((c.baseSkew + N(0, 0.004) + 0.03 * i * i * (pos / 5) * (bearish - bullish)) * 10000) / 10000;

  return { date, alerts, oiChanges, volumePercentile, skew, darkPool };
}

// ---------------------------------------------------------------------------
// Per-ticker day ranges, prices, scoring
// ---------------------------------------------------------------------------


const plansByTicker = new Map<string, Plan[]>();
for (const p of plans) {
  const arr = plansByTicker.get(p.catalyst.ticker) ?? [];
  arr.push(p);
  plansByTicker.set(p.catalyst.ticker, arr);
}

const footprints = new Map<string, DailyFootprint[]>();
const ohlc = new Map<string, OhlcBar[]>();
const stored: StoredScore[] = [];
const catalysts: Catalyst[] = [];

for (const c of COMPANIES) {
  const tplans = (plansByTicker.get(c.ticker) ?? []).sort((a, b) => (a.catalyst.eventDate < b.catalyst.eventDate ? -1 : 1));
  if (tplans.length === 0) continue;

  // Which days to generate: union of [T-66, min(T+4, today)] for each plan.
  const daySet = new Set<string>();
  for (const p of tplans) {
    const T = p.catalyst.eventDate;
    const start = addTradingDays(T, -67);
    const end = T > TODAY ? TODAY : addTradingDays(T, 4);
    for (const d of tradingDaysBetween(start, end)) daySet.add(d);
  }
  const days = [...daySet].sort();

  // Price path first (so strikes make sense), with event jumps resolved later.
  // We need the scorer's direction to decide the jump, so generate in two passes:
  // pass 1 produces footprints with a provisional price path; pass 2 re-prices.
  const dailyVol = c.vol / Math.sqrt(252);
  const drift: Record<string, number> = {};
  const jump: Record<string, number> = {};

  // Shape lookup: which plan (if any) governs a given day.
  const shapeFor = (d: string): DayShape => {
    let best: DayShape = { i: 0, dir: 0, pos: 0, post: 0 };
    for (const p of tplans) {
      const T = p.catalyst.eventDate;
      const win = footprintWindow(T);
      const idx = win.indexOf(d);
      if (idx >= 0) {
        const s: DayShape = { i: p.informed, dir: p.dir, pos: idx + 1, post: 0, eventDate: T };
        if (s.i > best.i) best = s;
      }
      const postDays = tradingDaysBetween(T, addTradingDays(T, 3));
      if (postDays.includes(d) && T <= TODAY) {
        best = { ...best, post: Math.max(best.post, 0.8 * (1 - postDays.indexOf(d) / 4)) };
      }
    }
    return best;
  };

  // Pre-event drift for informed events (price leans the informed way).
  for (const p of tplans) {
    const T = p.catalyst.eventDate;
    for (const d of footprintWindow(T)) drift[d] = (drift[d] ?? 0) + 0.004 * p.informed * p.dir;
  }

  const pricePath = (): OhlcBar[] => {
    const bars: OhlcBar[] = [];
    let px = c.price * U(0.85, 1.15);
    for (const d of days) {
      const r = jump[d] !== undefined ? jump[d] : N(drift[d] ?? 0, dailyVol);
      const open = px * (1 + (jump[d] !== undefined ? r * 0.85 : N(0, dailyVol * 0.25)));
      const close = px * (1 + r);
      const hi = Math.max(open, close) * (1 + Math.abs(N(0, dailyVol * 0.35)));
      const lo = Math.min(open, close) * (1 - Math.abs(N(0, dailyVol * 0.35)));
      bars.push({ ticker: c.ticker, date: d, open: r2(open), high: r2(hi), low: r2(lo), close: r2(close), volume: Math.round(c.marketcap / c.price / 250 * U(0.5, 1.8) * (jump[d] !== undefined ? 3 : 1)) });
      px = close;
    }
    return bars;
  };

  let bars = pricePath();
  const closeOf = new Map(bars.map((b) => [b.date, b.close]));
  const fp: DailyFootprint[] = days.map((d) => genDay(c, d, closeOf.get(d)!, shapeFor(d)));
  const fpByDate = new Map(fp.map((x) => [x.date, x]));

  // Score each plan, then decide the realized move from the scorer's direction.
  for (const p of tplans) {
    const T = p.catalyst.eventDate;
    const upcoming = T > TODAY;
    const fpDays = (upcoming ? partialFootprintWindow(T, TODAY) : footprintWindow(T)).map((d) => fpByDate.get(d)).filter((x): x is DailyFootprint => Boolean(x));
    const baseDays = baselineWindow(T).map((d) => fpByDate.get(d)).filter((x): x is DailyFootprint => Boolean(x));
    const others = tplans.filter((q) => q !== p && footprintWindow(T).includes(q.catalyst.eventDate)).length;
    const result = scoreEvent({ ticker: c.ticker, eventDate: T, footprintDays: fpDays, baselineDays: baseDays, partialWindow: upcoming, otherCatalystsInWindow: others });

    if (!upcoming) {
      const sign = result.direction === "bullish" ? 1 : result.direction === "bearish" ? -1 : p.dir;
      let move: number;
      if (p.forcedMovePct !== undefined) move = p.forcedMovePct;
      else if (p.informed >= 0.66) move = rand() < 0.82 ? sign * p.impliedMovePct * U(1.05, 2.3) : N(0, p.impliedMovePct * 0.9);
      else if (p.informed >= 0.3) move = rand() < 0.5 ? sign * p.impliedMovePct * U(0.9, 1.8) : N(0, p.impliedMovePct * 0.9);
      else move = N(0, p.impliedMovePct * 0.95);
      const reactionDay = p.catalyst.session === "afterhours" ? nextTradingDay(T) : (isTradingDay(T) ? T : nextTradingDay(T));
      jump[reactionDay] = move / 100;
    }
    catalysts.push(p.catalyst);
    stored.push({
      catalystId: p.catalyst.id,
      ticker: c.ticker,
      eventDate: T,
      score: result.score,
      direction: result.direction,
      verdict: "pending",
      realizedMovePct: null,
      impliedMovePct: Math.round(p.impliedMovePct * 100) / 100,
      partialWindow: upcoming,
      flags: result.flags,
      breakdown: { signals: result.signals, directionScore: result.directionScore, topAlerts: result.topAlerts, verdict: { verdict: "pending", realizedMovePct: null, impliedMovePct: p.impliedMovePct, impliedSource: "uw", reactionWindow: "T", fromDate: null, toDate: null }, band: scoreBand(result.score), daily: result.daily.filter((m) => m.date >= addTradingDays(T, -11)) },
      computedAt: `${TODAY}T20:05:00Z`,
    });
  }

  // Re-price with the event jumps baked in, then compute verdicts.
  bars = pricePath();
  ohlc.set(c.ticker, bars);
  // refresh underlying prices on alerts so they match the final path
  const close2 = new Map(bars.map((b) => [b.date, b.close]));
  for (const day of fp) for (const a of day.alerts) a.underlyingPrice = close2.get(day.date);
  footprints.set(c.ticker, fp);

  for (const s of stored.filter((x) => x.ticker === c.ticker)) {
    if (s.partialWindow) continue;
    const plan = tplans.find((p) => p.catalyst.id === s.catalystId)!;
    const v = computeVerdict({ eventDate: s.eventDate, session: plan.catalyst.session, direction: s.direction, ohlc: bars, impliedMovePct: s.impliedMovePct ?? undefined, today: TODAY });
    s.verdict = v.verdict;
    s.realizedMovePct = v.realizedMovePct;
    s.breakdown.verdict = v;
  }
}

function r2(x: number): number {
  return Math.round(x * 100) / 100;
}

// ---------------------------------------------------------------------------
// Write fixtures
// ---------------------------------------------------------------------------

rmSync(OUT, { recursive: true, force: true });
mkdirSync(join(OUT, "footprints"), { recursive: true });
mkdirSync(join(OUT, "ohlc"), { recursive: true });

catalysts.sort((a, b) => (a.eventDate < b.eventDate ? 1 : a.eventDate > b.eventDate ? -1 : a.ticker.localeCompare(b.ticker)));
stored.sort((a, b) => b.score - a.score);
const hero = stored.find((s) => s.ticker === "VXRA")!;

writeFileSync(join(OUT, "meta.json"), JSON.stringify({ today: TODAY, generatedAt: new Date(0).toISOString(), seed: SEED, synthetic: true, heroCatalystId: hero.catalystId, counts: { catalysts: catalysts.length, tickers: footprints.size } }, null, 2));
writeFileSync(join(OUT, "companies.json"), JSON.stringify(COMPANIES.map(({ ticker, name, sector, marketcap }) => ({ ticker, name, sector, marketcap })), null, 2));
writeFileSync(join(OUT, "catalysts.json"), JSON.stringify(catalysts, null, 1));
writeFileSync(join(OUT, "scores.json"), JSON.stringify(stored));
let dayRows = 0;
for (const [t, days] of footprints) {
  writeFileSync(join(OUT, "footprints", `${t}.json`), JSON.stringify({ ticker: t, days }));
  dayRows += days.length;
}
for (const [t, bars] of ohlc) writeFileSync(join(OUT, "ohlc", `${t}.json`), JSON.stringify(bars));

// ---------------------------------------------------------------------------
// seed.sql
// ---------------------------------------------------------------------------

const q = (s: string) => `'${s.replace(/'/g, "''")}'`;
const j = (v: unknown) => `${q(JSON.stringify(v))}::jsonb`;
const lines: string[] = [];
lines.push("-- Generated by scripts/generate-seed.ts. Synthetic demo data: fictional tickers and events.");
lines.push("-- Do not edit by hand; run `pnpm seed:generate`.");
lines.push("begin;");
lines.push("truncate table public.narrations, public.scores, public.catalysts, public.footprints;");
lines.push("insert into public.catalysts (id, ticker, kind, event_date, session, title, source, payload) values");
lines.push(catalysts.map((c) => `(${q(c.id)}, ${q(c.ticker)}, ${q(c.kind)}, ${q(c.eventDate)}, ${q(c.session)}, ${q(c.title)}, ${q(c.source)}, ${j(c.payload ?? {})})`).join(",\n") + ";");
lines.push("insert into public.scores (catalyst_id, ticker, event_date, score, direction, verdict, realized_move_pct, implied_move_pct, partial_window, flags, breakdown, computed_at) values");
lines.push(
  stored
    .map((s) => `(${q(s.catalystId)}, ${q(s.ticker)}, ${q(s.eventDate)}, ${s.score}, ${q(s.direction)}, ${q(s.verdict)}, ${s.realizedMovePct ?? "null"}, ${s.impliedMovePct ?? "null"}, ${s.partialWindow}, ${j(s.flags)}, ${j(s.breakdown)}, ${q(s.computedAt)})`)
    .join(",\n") + ";",
);
const fpValues: string[] = [];
for (const [t, days] of footprints) for (const d of days) fpValues.push(`(${q(t)}, ${q(d.date)}, 'daily', ${j(d)})`);
for (const [t, bars] of ohlc) for (const b of bars) fpValues.push(`(${q(t)}, ${q(b.date)}, 'ohlc', ${j(b)})`);
for (let i = 0; i < fpValues.length; i += 500) {
  lines.push("insert into public.footprints (ticker, trade_date, endpoint, payload) values");
  lines.push(fpValues.slice(i, i + 500).join(",\n") + ";");
}
lines.push("commit;");
writeFileSync(join(process.cwd(), "supabase", "seed.sql"), lines.join("\n") + "\n");

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

const past = stored.filter((s) => !s.partialWindow && !s.flags.isIndexOrEtf);
console.log(`catalysts: ${catalysts.length}  tickers: ${footprints.size}  ticker-days: ${dayRows}`);
console.log(`hero: ${hero.catalystId} score=${hero.score} ${hero.direction} verdict=${hero.verdict} realized=${hero.realizedMovePct}% implied=${hero.impliedMovePct}%`);
console.log("leaderboard (top 12, last 90d, non-ETF):");
for (const s of past.filter((s) => s.eventDate >= "2026-07-24").slice(0, 12)) {
  console.log(`  ${s.score.toFixed(1).padStart(5)}  ${s.ticker.padEnd(5)} ${s.eventDate}  ${s.direction.padEnd(7)} ${s.verdict.padEnd(8)} realized=${s.realizedMovePct} implied=${s.impliedMovePct}`);
}
const bands = { quiet: 0, notable: 0, "someone-knew": 0 };
for (const s of past) bands[s.breakdown.band]++;
console.log("bands:", bands, "matched:", past.filter((s) => s.verdict === "matched").length, "missed:", past.filter((s) => s.verdict === "missed").length);
console.log("radar:");
for (const s of stored.filter((s) => s.partialWindow).sort((a, b) => b.score - a.score)) console.log(`  ${s.score.toFixed(1).padStart(5)}  ${s.ticker.padEnd(5)} ${s.eventDate} ${s.direction} days=${s.flags.footprintDaysUsed}`);

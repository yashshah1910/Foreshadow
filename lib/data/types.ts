import type {
  Catalyst,
  CatalystKind,
  DailyFootprint,
  Direction,
  IsoDate,
  OhlcBar,
  ScoreBandName,
  ScoreFlags,
  StoredScore,
  TradeExample,
  Verdict,
} from "@foreshadow/core";
import type { DataMode } from "@/lib/env";

export interface Company {
  ticker: string;
  name: string;
  sector: string;
  marketcap?: number;
}

/** One session of flow premium for the row sparkline (T-10 .. T-1). */
export interface StripDay {
  date: IsoDate;
  call: number;
  put: number;
  /** Inside the five-day footprint window. */
  inWindow: boolean;
  /** Footprint day that hasn't happened yet (Live Radar). */
  future: boolean;
}

export interface EventSummary {
  catalyst: Catalyst;
  strip: StripDay[];
  company: Company | null;
  score: number;
  direction: Direction;
  verdict: Verdict;
  realizedMovePct: number | null;
  impliedMovePct: number | null;
  partialWindow: boolean;
  band: ScoreBandName;
  flags: ScoreFlags;
  computedAt: string;
}

export interface Narration {
  story: string;
  caption: string;
  model: string;
  numbersVerified: boolean;
  createdAt: string;
}

export interface EventDetail {
  summary: EventSummary;
  stored: StoredScore;
  /** The footprint window days (T-5..T-1, or the partial window) with raw rows. */
  footprint: DailyFootprint[];
  windowDays: IsoDate[];
  /** Daily bars for T-10 .. T+3 (or up to today). */
  chartBars: OhlcBar[];
  narration: Narration | null;
  /** Other scored events for the same ticker, newest first. */
  related: EventSummary[];
  /**
   * Totals over every flagged trade in the window. Set, with `sampleTrades`,
   * when the cached case drops the raw trades (pages never need all of them; a
   * busy stock like TSLA has 9,000+).
   */
  alertStats?: TradeTotals;
  /** The largest trades as examples, without UW ids or other raw fields. */
  sampleTrades?: SampleTrade[];
}

export interface TradeTotals {
  count: number;
  premium: number;
}

/** One flagged trade shown as an example of the betting behind a score. */
export type SampleTrade = TradeExample;

export interface LeaderboardFilters {
  kind?: CatalystKind | "all";
  minScore?: number;
  matchedOnly?: boolean;
  /** Look-back window in calendar days (default 90). */
  days?: number;
  limit?: number;
}

export interface HitRate {
  scored: number;
  strong: number;
  matched: number;
  strongMatched: number;
}

/** Scheduled news on file for a ticker that hasn't been scored yet. */
export interface QueuedCatalyst {
  kind: CatalystKind;
  eventDate: IsoDate;
  title: string;
}

export interface Dossier {
  ticker: string;
  company: Company | null;
  events: EventSummary[];
  hitRate: HitRate;
  /** Set when the ticker has catalysts on file but none scored yet. */
  queued?: QueuedCatalyst[];
}

export interface RadarItem extends EventSummary {
  windowStart: IsoDate;
  windowOpen: boolean;
  daysElapsed: number;
  daysTotal: number;
}

export interface Stats {
  mode: DataMode;
  today: IsoDate;
  synthetic: boolean;
  events: number;
  tickers: number;
  lastComputedAt: string | null;
  heroCatalystId: string | null;
  /** Finished, ranked cases in the last 90 days, as the leaderboard counts them. */
  past: PastCounts;
}

export interface PastCounts {
  checked: number;
  /** Score 40+. */
  unusual: number;
  /** Score 40+ and the bets were right. */
  unusualRight: number;
}

/** One finished case, reduced to what the scorecard needs. */
export interface ScorecardCase {
  kind: CatalystKind;
  score: number;
  direction: Direction;
  verdict: Verdict;
  realizedMovePct: number | null;
  impliedMovePct: number | null;
}

export interface ScorecardBand {
  /** Inclusive score range, e.g. 40-69. */
  min: number;
  max: number;
  label: string;
  cases: number;
  /** The bets were right: the stock moved at least the expected amount, in the bets' direction. */
  right: number;
  /** The stock moved at least as much as options priced in, either way. */
  movedMore: number;
  /** Cases with a clear lean, and how many of those the stock moved toward. */
  leaned: number;
  leanedRight: number;
}

export interface Scorecard {
  /** Finished cases counted, across every kind. */
  cases: number;
  kinds: { kind: CatalystKind; cases: number; bands: ScorecardBand[] }[];
}

export interface DataSource {
  readonly mode: DataMode;
  today(): Promise<IsoDate>;
  getStats(): Promise<Stats>;
  getLeaderboard(filters?: LeaderboardFilters): Promise<EventSummary[]>;
  getEvent(id: string): Promise<EventDetail | null>;
  getTickerDossier(ticker: string): Promise<Dossier | null>;
  getRadar(opts?: { daysAhead?: number; minScore?: number }): Promise<RadarItem[]>;
  searchTickers(query: string): Promise<Company[]>;
  getNarration(catalystId: string, score: number): Promise<Narration | null>;
  saveNarration(catalystId: string, score: number, narration: Narration): Promise<void>;
  getCompany(ticker: string): Promise<Company | null>;
  /** How often the bets were right, by score band and kind of news, over every finished case. */
  getScorecard(): Promise<Scorecard>;
}

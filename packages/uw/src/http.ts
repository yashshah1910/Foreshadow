/**
 * HTTP core for the Unusual Whales client: URL building, auth headers, the
 * token-bucket limiter, adaptive waits driven by the `x-uw-*` usage headers,
 * retries, `{ data }` unwrapping and typed errors.
 */

import { UwAccessError, UwApiError, UwAuthError, UwRateLimitError } from "./errors";
import { TokenBucket } from "./limiter";
import type { UwUsage } from "./types";
import { asArray, isRecord, numOpt, strOpt } from "./util";

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;
export type QueryValue = string | number | boolean | null | undefined | readonly (string | number)[];
export type Query = Record<string, QueryValue>;

export interface UwClientOptions {
  apiKey: string;
  /** Defaults to `https://api.unusualwhales.com`. */
  baseUrl?: string;
  /** Defaults to `globalThis.fetch`. Inject a fake in tests. */
  fetch?: FetchLike;
  /** Token-bucket capacity and refill rate. Defaults to 120 (UW's documented default). */
  requestsPerMinute?: number;
  /** Receives one line per HTTP request. */
  logger?: (line: string) => void;
  /** Retries for 429 / 5xx / network errors. Defaults to 3. */
  maxRetries?: number;
  /** Test hooks: replace the real clock. */
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
}

export const DEFAULT_BASE_URL = "https://api.unusualwhales.com";
export const DEFAULT_REQUESTS_PER_MINUTE = 120;
/** Required by UW's skill.md on every request. */
export const UW_CLIENT_API_ID = "100001";
const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_429_WAIT_MS = 5_000;

const defaultSleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));
const defaultFetch: FetchLike = (input, init) => globalThis.fetch(input, init);

export class UwHttp {
  readonly baseUrl: string;
  private readonly headers: Record<string, string>;
  private readonly fetchFn: FetchLike;
  private readonly limiter: TokenBucket;
  private readonly logger?: (line: string) => void;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly now: () => number;
  private readonly maxRetries: number;
  private usageState: UwUsage = {
    dailyCount: null,
    dailyLimit: null,
    minuteRemaining: null,
    minuteResetMs: null,
    updatedAt: null,
  };

  constructor(opts: UwClientOptions) {
    if (!opts.apiKey) throw new Error("UwClient: apiKey is required");
    this.baseUrl = (opts.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
    this.headers = {
      Authorization: `Bearer ${opts.apiKey}`,
      Accept: "application/json",
      "UW-CLIENT-API-ID": UW_CLIENT_API_ID,
    };
    this.fetchFn = opts.fetch ?? defaultFetch;
    this.logger = opts.logger;
    this.sleep = opts.sleep ?? defaultSleep;
    this.now = opts.now ?? (() => Date.now());
    this.maxRetries = opts.maxRetries ?? DEFAULT_MAX_RETRIES;
    this.limiter = new TokenBucket(opts.requestsPerMinute ?? DEFAULT_REQUESTS_PER_MINUTE, {
      now: this.now,
      sleep: this.sleep,
    });
  }

  /** Latest usage headers (`x-uw-daily-req-count`, `x-uw-token-req-limit`, ...). */
  get usage(): UwUsage {
    return { ...this.usageState };
  }

  /** Absolute URL for `path` + `query`; array values become `key[]=v`. */
  buildUrl(path: string, query: Query = {}): string {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) {
      if (value === undefined || value === null) continue;
      if (typeof value === "object") {
        for (const v of value) params.append(`${key}[]`, String(v));
      } else {
        params.append(key, String(value));
      }
    }
    const qs = params.toString();
    return `${this.baseUrl}${path}${qs ? `?${qs}` : ""}`;
  }

  /**
   * GET `path` and return the unwrapped `data` member of the JSON body (or the
   * body itself when there is no `data` key). Applies the limiter, records
   * usage headers, retries 429/5xx/network failures and throws typed errors.
   */
  async request<T>(path: string, query: Query = {}): Promise<T> {
    const url = this.buildUrl(path, query);
    const label = url.slice(this.baseUrl.length);
    for (let attempt = 0; ; attempt++) {
      await this.limiter.acquire();
      const started = this.now();
      let res: Response;
      try {
        res = await this.fetchFn(url, { method: "GET", headers: this.headers });
      } catch (err) {
        this.log(`GET ${label} -> network error: ${describe(err)}`);
        if (attempt >= this.maxRetries) {
          throw new UwApiError({ status: 0, path, message: `Network error: ${describe(err)}` });
        }
        await this.sleep(backoffMs(attempt));
        continue;
      }
      this.recordUsage(res.headers);
      this.log(`GET ${label} -> ${res.status} (${this.now() - started}ms)`);
      const body = await readBody(res);
      if (res.ok) return unwrap(body) as T;

      const err = toError(res.status, body, path, res.headers.get("x-request-id") ?? undefined);
      const retryable = res.status === 429 || res.status >= 500;
      if (!retryable || attempt >= this.maxRetries) throw err;
      if (res.status === 429) {
        await this.sleep(numOpt(res.headers.get("x-uw-req-per-minute-reset")) ?? DEFAULT_429_WAIT_MS);
      } else {
        await this.sleep(backoffMs(attempt));
      }
    }
  }

  /** `request` for list endpoints: a non-array `data` yields `[]`. */
  async requestList<T>(path: string, query: Query = {}): Promise<T[]> {
    const data = await this.request<unknown>(path, query);
    return asArray(data) as T[];
  }

  private recordUsage(h: Headers): void {
    const prev = this.usageState;
    const remaining = numOpt(h.get("x-uw-req-per-minute-remaining"));
    const reset = numOpt(h.get("x-uw-req-per-minute-reset"));
    this.usageState = {
      dailyCount: numOpt(h.get("x-uw-daily-req-count")) ?? prev.dailyCount,
      dailyLimit: numOpt(h.get("x-uw-token-req-limit")) ?? prev.dailyLimit,
      minuteRemaining: remaining ?? prev.minuteRemaining,
      minuteResetMs: reset ?? prev.minuteResetMs,
      updatedAt: new Date(this.now()).toISOString(),
    };
    if (remaining !== undefined && remaining <= 0 && reset !== undefined) this.limiter.pauseFor(reset);
  }

  private log(line: string): void {
    this.logger?.(line);
  }
}

function backoffMs(attempt: number): number {
  return 500 * 2 ** attempt;
}

function describe(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

async function readBody(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text) return undefined;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function unwrap(body: unknown): unknown {
  return isRecord(body) && "data" in body ? body.data : body;
}

function toError(status: number, body: unknown, path: string, headerRequestId?: string): UwApiError {
  const fields = isRecord(body)
    ? {
        code: strOpt(body.code),
        reason: strOpt(body.reason),
        requestId: strOpt(body.request_id) ?? headerRequestId,
        message: strOpt(body.message) ?? strOpt(body.msg),
      }
    : { requestId: headerRequestId, message: typeof body === "string" ? body.trim() : undefined };
  const init = {
    status,
    path,
    body,
    code: fields.code,
    reason: fields.reason,
    requestId: fields.requestId,
    message: `UW ${status} ${path}: ${fields.message ?? defaultMessage(status)}`,
  };
  if (status === 401) return new UwAuthError(init);
  if (status === 403) return new UwAccessError(init);
  if (status === 429) return new UwRateLimitError(init);
  return new UwApiError(init);
}

function defaultMessage(status: number): string {
  if (status === 401) return "authentication required";
  if (status === 403) return "access denied";
  if (status === 404) return "route not found";
  if (status === 422) return "unprocessable request";
  if (status === 429) return "rate limit exceeded";
  return status >= 500 ? "server error" : "request failed";
}

/**
 * Typed errors raised by the Unusual Whales client.
 *
 * Every error carries the HTTP status, the UW `code` (when the body had one),
 * the request id and the request path so callers can branch on fields rather
 * than on message text. UW documents that only `code` and `message` are
 * guaranteed in a 403 body; everything else is optional.
 */

export interface UwErrorInit {
  status: number;
  message: string;
  path: string;
  code?: string;
  reason?: string;
  requestId?: string;
  body?: unknown;
}

/** 403 `code` meaning the requested date predates the plan's lookback. */
export const HISTORIC_ACCESS_CODE = "historic_data_access_missing";

export class UwApiError extends Error {
  readonly status: number;
  readonly path: string;
  readonly code?: string;
  readonly reason?: string;
  readonly requestId?: string;
  readonly body?: unknown;

  constructor(init: UwErrorInit) {
    super(init.message);
    this.name = "UwApiError";
    this.status = init.status;
    this.path = init.path;
    this.code = init.code;
    this.reason = init.reason;
    this.requestId = init.requestId;
    this.body = init.body;
  }
}

/** HTTP 401: missing, malformed or unrecognized token. */
export class UwAuthError extends UwApiError {
  constructor(init: UwErrorInit) {
    super(init);
    this.name = "UwAuthError";
  }
}

/**
 * HTTP 403: the token is valid but lacks an entitlement. `code` names it:
 * `missing_access`, `historic_data_access_missing`, `advanced_tier_required`,
 * `futures_access_required`, `politics_scope_required`,
 * `volatility_scope_required` or `admin_required`.
 */
export class UwAccessError extends UwApiError {
  constructor(init: UwErrorInit) {
    super(init);
    this.name = "UwAccessError";
  }

  /** True when the plan's historical lookback does not reach the requested date. */
  get isHistoricLookback(): boolean {
    return this.code === HISTORIC_ACCESS_CODE;
  }
}

/** HTTP 429 after every retry was exhausted. */
export class UwRateLimitError extends UwApiError {
  constructor(init: UwErrorInit) {
    super(init);
    this.name = "UwRateLimitError";
  }
}

/** Narrow an unknown thrown value to a lookback 403. */
export function isHistoricAccessError(err: unknown): err is UwAccessError {
  return err instanceof UwAccessError && err.code === HISTORIC_ACCESS_CODE;
}

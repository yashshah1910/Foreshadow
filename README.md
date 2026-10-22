# Foreshadow: *Someone knew. Prove it.*

**Live: [foreshadow-six.vercel.app](https://foreshadow-six.vercel.app)**

Before scheduled company news, like an FDA decision or an earnings report, some traders pile into options that only
pay off if the stock jumps, or only if it drops. Foreshadow finds that betting in **Unusual Whales** data, rates how
unusual it was from 0 to 100 against the stock's own normal, then checks what the stock actually did.

Built for Unusual Whales Hackathon #1 with Next.js 16 and Supabase. The scorer is plain, deterministic arithmetic
(no LLM anywhere near the numbers); Claude writes the plain-English summaries and answers questions. There is also a
remote MCP server, so Claude can query Foreshadow directly.

The live site covers the last 90 days of FDA decisions and earnings for US companies worth over $2B with listed
options.

| Page | What it shows |
| --- | --- |
| **Past cases** `/leaderboard` | Finished news events from the last 90 days, ranked by how unusual the betting was, with which way the bets leaned, the move options priced in, the actual move, and whether the bets were right. Filters: type of news, very unusual only, bets were right, time range. |
| **Case page** `/event/[id]` | One case end to end: a day-by-day chart (stock price on top, one row per measurement below, the five counted days highlighted), every large trade behind the score, the score's arithmetic, a Claude summary, and "Ask about this case". Shareable, with a generated preview image. |
| **Stock page** `/ticker/[t]` | Every case for one stock on a timeline, its track record ("very unusual 3 times, right 2 of those") and a Claude summary. Stocks whose news isn't scored yet show what's queued. |
| **Coming up** `/radar` | News due in the next two weeks, scored on the part of the five-day window that has already happened, pushed to the browser with Supabase Realtime. |
| **How it works** `/docs` | The method in plain words, then the exact formula, data sources, API and MCP setup. |
| **MCP** `/api/mcp` | Remote MCP (streamable HTTP): `foreshadow_score`, `foreshadow_radar`, `foreshadow_history`. Plus `packages/mcp-stdio` for stdio-only clients. |
| **Accounts** `/settings` | Supabase Auth (magic link + Google). Bring your own UW key, stored in Supabase Vault. Watchlists. Discord-webhook or email alerts when a Coming-up score crosses your threshold. |

## Run it locally

```bash
git clone <repo> && cd foreshadow && pnpm install
cp .env.example .env      # leave everything empty for demo mode
pnpm dev                  # http://localhost:3000
```

That's it for the demo: with no keys the app serves the seeded dataset from `supabase/fixtures/`.

With Supabase (Docker running):

```bash
pnpm supabase start && pnpm supabase db reset   # applies migrations + seed.sql
# put the printed URL and keys in .env (see Keys below), then pnpm dev
```

With a UW key, replace the seed with real data:

```bash
pnpm ingest --mode backfill --days 90 --kinds fda,earnings   # scores the last 90 days; resumable, safe to rerun
pnpm ingest --mode radar                                     # scores the next 10 trading days
```

Useful flags: `--min-cap 2e9` (earnings market-cap floor, the default), `--concurrency 3` (the hackathon key allows
3 requests in flight), `--max N`, `--dry-run`, `--loop`. `pnpm uw:check AAPL` reports how far back your UW plan's
history goes.

Checks: `pnpm test` (127 tests: scorer, UW client, narrator), `pnpm typecheck`, `pnpm lint`.

## Keys

| Variable | Needed for |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Accounts, BYOK, watchlists, alerts, Realtime. Empty → demo mode from fixtures. |
| `SUPABASE_SECRET_KEY` | The ingest, the narration cache and server-side reads. (`SUPABASE_SERVICE_ROLE_KEY` also works.) |
| `UW_API_KEY` | Fresh scoring and Live Radar. Signed-in users can bring their own key instead (Settings → stored in Vault). |
| `ANTHROPIC_API_KEY` | The Narrator story, Dossier summary, the Ask panel and the catalyst tagger. **Without it every surface still works**; the story slot shows the deterministic template. |
| `CRON_SECRET` | Protects `/api/cron/ingest`. Vercel Cron sends it as a Bearer token; the GitHub Actions radar workflow needs it as a repo secret. |
| `RESEND_API_KEY` | Email alerts (Discord webhooks need nothing). |

No keys live in the repo; copy `.env.example`.

## The score

One number per (ticker, event), 0–100, plus a direction and, for past events, a verdict. Reproducible from the rows
on the card.

- **Windows.** Footprint = trading days T-5 → T-1. Baseline = the 60 trading days before that (T-65 → T-6). NYSE
  holidays are skipped.
- **Signals** (each a z-score of the footprint window against the ticker's own baseline):

  | Signal | UW endpoint | Computed | Weight |
  | --- | --- | --- | --- |
  | Flow-alert intensity | `/api/option-trades/flow-alerts` | alerts/day and premium/day vs baseline, plus sweep share | 25% |
  | Directional premium | same, by call/put and ask/bid side | ask-side calls − ask-side puts per day | 20% |
  | New open interest | `/api/stock/{t}/oi-change` | Σ \|OI change\| per day; call/put imbalance feeds direction | 20% |
  | Volume unusualness | `/api/stock/{t}/options-volume` → percentile (`/unusualness` for today) | 0–100 percentile used directly | 15% |
  | Skew shift | `/api/stock/{t}/historical-risk-reversal-skew` | change in 25Δ put−call IV across the window | 10% |
  | Dark pool prints | `/api/darkpool/{t}` | notional of prints ≥ $1M vs baseline | 10% |

- **Formula.** `Score = Σ wᵢ · min(max(zᵢ, 0) / 4, 1) · 100`. Dollar metrics are log1p-transformed before the z-score.
  Direction = sign of `z(directional premium) + 2·OI imbalance − z(skew shift)`; |·| < 0.5 is "mixed".
  Under 40 is ordinary, 40 to 70 is unusual, 70+ is very unusual (the site highlights these).
- **Verdict.** Close-to-close move on the reaction day (T for pre-market/intraday, T+1 for after-hours) vs the implied
  move (UW earnings expected move, else the 1-day interpolated implied move at T-1, else a stated 4% fallback).
  Matched = ≥ 1× implied and the sign agrees with the direction.
- **Noise controls.** Index/ETF tickers never rank. < 20 baseline days with activity → "insufficient history".
  ≥ 2 catalysts in the window → flagged multi-catalyst. Only events with a verified outcome rank.
- **History depth.** If the UW plan refuses dates older than N days the loader finds the cut-off itself, shrinks the
  baseline to what is available and records a warning on the ingest run; the scoring still works with a 20-day
  baseline, the leaderboard just covers a shorter span.

Implementation: `packages/core/src/{windows,scorer,verdict}.ts` with tests in `packages/core/tests/`.

## Where Claude fits

Claude never computes a number. `packages/narrator/` wraps the Messages API for four jobs:

1. **Narrator**: a short story and a shareable caption per case, written for people who don't trade, from the raw alert rows, with a strict
   JSON output contract. Every number in the story is checked against the input rows; if one can't be verified the
   call is retried once, then the template is shown. The rows render beside the story so a reader can check.
2. **Catalyst tagger**: maps President's-schedule and economic-calendar rows to tickers and sectors with a confidence.
3. **Investigator** ("Ask about this case"): a short tool loop (≤ 6 calls) over `foreshadow_score`, `foreshadow_radar`,
   `foreshadow_history` **and the Unusual Whales hosted MCP** (`https://api.unusualwhales.com/api/mcp`, with the
   user's own key). Tool calls are shown inline.
4. **Stock summary**: one paragraph on whether a ticker is a repeat offender.

Narrations are cached by (ticker, event date, score). Model: `claude-sonnet-5-5` (override with `NARRATOR_MODEL`).

## MCP

```bash
claude mcp add --transport http foreshadow https://<your-host>/api/mcp
```

or for stdio-only clients `FORESHADOW_URL=https://<your-host> npx foreshadow-mcp` (see `packages/mcp-stdio`).
Try: *"did anyone know about VXRA before Sep 18?"*

## Architecture

```
app/                     Next.js 16 App Router (Turbopack, Tailwind 4)
  page.tsx               home: what it does, a real case, how it works, the most unusual cases
  leaderboard/ event/[id]/ ticker/[t]/ radar/ docs/ settings/ login/
  globals.css            the design tokens (light only; grouping by tinted trays, no divider lines)
  api/cron/ingest        fetch UW → score → upsert Supabase (Vercel Cron daily; GitHub Actions every 15 min in market hours for the radar)
  api/mcp                remote MCP (mcp-handler, streamable HTTP)
  api/narrate api/ask api/dossier    Claude route handlers
  api/score api/radar api/history    REST twins of the MCP tools (used by the stdio wrapper)
lib/data/                one DataSource interface, two implementations: Supabase (reads cached for a few minutes) or the JSON fixtures (demo mode)
lib/ingest.ts            the pipeline shared by the cron route and `pnpm ingest`
packages/core/           scorer.ts, windows.ts, verdict.ts + tests  (pure, deterministic)
packages/uw/             typed client for the UW endpoints, rate limiter, Supabase-backed cache, footprint loader + tests
packages/narrator/       Claude Messages API: story, tagger, investigator loop, dossier + tests
packages/mcp-stdio/      npx wrapper that proxies to the REST endpoints
supabase/                migrations (schema + RLS + Vault functions), seed.sql, fixtures/
scripts/                 generate-seed.ts (synthetic demo data), ingest.ts (local backfill), depth-check.ts
vercel.json              cron schedules
```

Supabase holds every row (Postgres), every user (Auth), every user's UW key (Vault, via `set_uw_key` /
`get_uw_key` functions; the key never sits in a table column) and pushes Radar updates to the browser (Realtime on
`scores`). RLS: data tables are readable by everyone (`footprints` by signed-in users only, never re-served
anonymously) and written only by the service role from the cron; everything user-owned is owner-only.

## The demo dataset is synthetic

`supabase/fixtures/` and `supabase/seed.sql` are generated by `scripts/generate-seed.ts` with a fixed seed: 28
**fictional** tickers, 72 catalysts, ~4,000 ticker-days of UW-shaped alerts, OI changes, dark pool prints and
OHLC, scored by the real scorer. Nothing in it is real market data, and a banner across the top of every page says
so. The live site runs on Supabase with real Unusual Whales data; the fixtures exist so the app runs with no keys.

## Not financial advice

Foreshadow detects positioning, not intent. A high score is a statistical anomaly relative to a ticker's own
history; it is never an allegation that anyone traded illegally.

MIT © 2026 Yash Shah

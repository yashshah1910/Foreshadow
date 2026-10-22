# Foreshadow — *Someone knew. Prove it.*

Foreshadow scores every market catalyst (FDA decisions, earnings, congress trades, insider filings) by how much
informed options positioning appeared in **Unusual Whales** data in the five trading days before it, verifies the
footprint against the realized move, and watches upcoming catalysts for the same pattern forming live.

Built for Unusual Whales Hackathon #1 on Next.js 16 + Supabase, with a deterministic scorer (no LLM in the
arithmetic), a remote MCP server, and Claude for the words.

| Surface | What it does |
| --- | --- |
| **Leaderboard** `/leaderboard` | The 20 highest-scoring past catalysts of the last 90 days with direction, verdict and implied → realized move. Filters: type, 70+, matched only, window. |
| **Event Card** `/event/[id]` | One chart: closes T-10 → T+3, the event as a gold marker, the footprint window as a shadow cast backwards from it, daily call/put premium bars, new open interest at the strike. Beside it: every alert that drove the score, the signal breakdown, the Claude story, and "Ask Foreshadow". Shareable with an OG image. |
| **Ticker Dossier** `/ticker/[t]` | Every scored catalyst for a ticker on a timeline, the hit rate ("5 of 8 earnings had a 70+ footprint, 4 matched"), and a one-paragraph Claude summary. |
| **Live Radar** `/radar` | Upcoming catalysts in the next 10 trading days scored on today's partial window, refreshed every 15 minutes in market hours and pushed to the browser with Supabase Realtime. |
| **MCP** `/api/mcp` | Remote MCP (streamable HTTP): `foreshadow_score`, `foreshadow_radar`, `foreshadow_history`. Plus `packages/mcp-stdio` for stdio-only clients. |
| **Accounts** `/settings` | Supabase Auth (magic link + Google). Bring-your-own UW key stored in Supabase Vault. Watchlists. Discord / email alerts when a Radar score crosses your threshold. |

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
# put the printed URL / anon key / service_role key in .env, then pnpm dev
```

With a UW key, replace the seed with real data:

```bash
UW_API_KEY=… pnpm ingest --mode backfill --days 90 --loop   # scores the last 90 days, resumable
UW_API_KEY=… pnpm ingest --mode radar                       # scores the next 10 trading days
```

Tests (core scorer, UW client, narrator — 123 tests): `pnpm test`. Typecheck: `pnpm typecheck`. Lint: `pnpm lint`.

## Keys

| Variable | Needed for |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Accounts, BYOK, watchlists, alerts, Realtime. Empty → demo mode from fixtures. |
| `SUPABASE_SECRET_KEY` | The cron ingest, narration cache, reading footprints server-side. |
| `UW_API_KEY` | Fresh scoring and Live Radar. Signed-in users can bring their own key instead (Settings → stored in Vault). |
| `ANTHROPIC_API_KEY` | The Narrator story, Dossier summary, the Ask panel and the catalyst tagger. **Without it every surface still works**; the story slot shows the deterministic template. |
| `CRON_SECRET` | Protects `/api/cron/ingest` (Vercel Cron sends it as a Bearer token). |
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
  < 40 quiet · 40–70 notable · 70+ "someone knew".
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

1. **Narrator** — a 3-sentence story and a tweet-ready caption per Event Card, from the raw alert rows, with a strict
   JSON output contract. Every number in the story is checked against the input rows; if one can't be verified the
   call is retried once, then the template is shown. The rows render beside the story so a reader can check.
2. **Catalyst tagger** — maps President's-schedule and economic-calendar rows to tickers and sectors with a confidence.
3. **Investigator** ("Ask Foreshadow") — a short tool loop (≤ 6 calls) over `foreshadow_score`, `foreshadow_radar`,
   `foreshadow_history` **and the Unusual Whales hosted MCP** (`https://api.unusualwhales.com/api/mcp`, with the
   user's own key). Tool calls are shown inline.
4. **Dossier summary** — one paragraph on whether a ticker is a repeat offender.

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
  page.tsx               landing: the hero Event Card is the hero
  leaderboard/ event/[id]/ ticker/[t]/ radar/ docs/ settings/ login/
  api/cron/ingest        fetch UW → score → upsert Supabase (Vercel Cron daily; GitHub Actions every 15 min in market hours for the radar)
  api/mcp                remote MCP (mcp-handler, streamable HTTP)
  api/narrate api/ask api/dossier    Claude route handlers
  api/score api/radar api/history    REST twins of the MCP tools (used by the stdio wrapper)
lib/data/                one DataSource interface, two implementations: Supabase, or the JSON fixtures (demo mode)
lib/ingest.ts            the pipeline shared by the cron route and `pnpm ingest`
packages/core/           scorer.ts, windows.ts, verdict.ts + tests  (pure, deterministic)
packages/uw/             typed client for the UW endpoints, rate limiter, Supabase-backed cache, footprint loader + tests
packages/narrator/       Claude Messages API: story, tagger, investigator loop, dossier + tests
packages/mcp-stdio/      npx wrapper that proxies to the REST endpoints
supabase/                migrations (schema + RLS + Vault functions), seed.sql, fixtures/
scripts/                 generate-seed.ts (synthetic demo data), ingest.ts (local backfill)
vercel.json              cron schedules
```

Supabase holds every row (Postgres), every user (Auth), every user's UW key (Vault, via `set_uw_key` /
`get_uw_key` functions; the key never sits in a table column) and pushes Radar updates to the browser (Realtime on
`scores`). RLS: data tables are readable by everyone (`footprints` by signed-in users only, never re-served
anonymously) and written only by the service role from the cron; everything user-owned is owner-only.

## The demo dataset is synthetic

`supabase/fixtures/` and `supabase/seed.sql` are generated by `scripts/generate-seed.ts` with a fixed seed: 28
**fictional** tickers, 72 catalysts, ~4,000 ticker-days of UW-shaped alerts, OI changes, dark pool prints and
OHLC, scored by the real scorer. Nothing in it is real market data; the "Demo data" badge in the header says so.
Add a UW key and run the ingest to replace it. (With a UW key the leaderboard is real; the fixtures were used to
build and screenshot the UI without spending API credits.)

## Hackathon submission (Discord post)

See [`docs/discord-post.md`](docs/discord-post.md).

## Not financial advice

Foreshadow detects positioning, not intent. A high score is a statistical anomaly relative to a ticker's own
history; it is never an allegation that anyone traded illegally.

MIT © 2026 Yash Shah

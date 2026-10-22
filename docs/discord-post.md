Hackathon1: Foreshadow

**What it does**
Foreshadow scores every market catalyst (FDA decisions, earnings, congress trades, insider filings) by how much informed options positioning appeared in Unusual Whales data in the 5 days before it, verifies the footprint against the realized move, and watches upcoming catalysts for the same pattern forming live. Someone knew — now you can prove it.

Live: https://foreshadow.app  (no install; demo data out of the box; sign in to add your own UW key for live mode)

**Demo**
[video link] + 3 screenshots (Leaderboard, Event Card, Live Radar)

**Built with**
UW endpoints used: option-trades/flow-alerts, stock/{t}/oi-change, stock/{t}/options-volume + stock/{t}/unusualness, stock/{t}/historical-risk-reversal-skew, darkpool/{t}, stock/{t}/ohlc/1d, stock/{t}/interpolated-iv, market/fda-calendar, earnings/premarket + earnings/afterhours, congress/recent-trades (+ congress/unusual-trades when entitled), insider/transactions, potus/schedule, market/economic-calendar
MCP / agent used? Yes, both ways. Foreshadow exposes a remote MCP (add https://foreshadow.app/api/mcp to Claude or Cursor: foreshadow_score, foreshadow_radar, foreshadow_history) and an in-app Claude agent ("Ask Foreshadow") that uses the UW hosted MCP plus those tools to investigate an event, showing its tool calls. Claude also writes the plain-English story on each Event Card from the raw alert rows, with every number verified against the rows (the scoring itself is deterministic, no LLM). Claude Code used for development.
Other tools/libs: Next.js 16 on Vercel, Supabase (Postgres, Auth, Vault, Realtime), TypeScript, Tailwind 4, mcp-handler, Claude Messages API, Resend

**Your files**
GitHub repo link: [link]

**How to run it locally**
1. git clone [repo] && cd foreshadow && pnpm install
2. cp .env.example .env  →  leave empty for demo mode, or add Supabase URL/anon key (free project), optional UW_API_KEY and ANTHROPIC_API_KEY
3. pnpm dev  →  http://localhost:3000   (with Supabase: pnpm supabase db reset first; with a UW key: pnpm ingest --mode backfill --loop)

**Requirements / API key setup**
Seeded (synthetic, clearly labelled) data shows the leaderboard and Event Cards with no UW key. Add a UW API key (in Settings when signed in, or UW_API_KEY in .env) for Live Radar and fresh scoring; add an Anthropic key for narrations and the Ask panel. No keys in the repo (.env.example only).

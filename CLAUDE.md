# Foreshadow — notes for agents

- Scorer, windows and verdict live in `packages/core`; they are pure and tested. Never put an LLM in that path.
- `lib/data` is the only way the UI reads data. Demo mode (no Supabase env) reads `supabase/fixtures`; otherwise Supabase.
- `scripts/generate-seed.ts` regenerates fixtures + `supabase/seed.sql` deterministically (`pnpm seed:generate`). The dataset is synthetic.
- `lib/ingest.ts` is the pipeline shared by `/api/cron/ingest` and `pnpm ingest`; it has no Next imports on purpose.
- Design system "case files on a tray" lives in `app/globals.css`: light only (no dark theme, no toggle). White page; related things group on soft blue-grey trays (`.tray`) holding white `.card`s, never divider lines or gridlines. Type is Bricolage Grotesque (display) + Instrument Sans (text, tabular numbers); IBM Plex Mono only for code. One signature: the yellow highlighter (`.hl`, `.hl-band`) marks the five counted days and 70+ scores; pen blue is for chart annotations only. Calls/puts `#0e8a7a`/`#d23a52` (colour-blind validated).
- Charts are hand-written SVG: `components/event/Trace.tsx` (the Event Card polygraph), `components/viz/TellStrip.tsx` (row sparkline), `components/viz/MoveGauge.tsx`. Every case list uses `components/cases/CaseList.tsx`.
- Custom CSS classes sit in `@layer components` so Tailwind utilities can override them. Fixture JSON is cached per server process: restart `next dev` after `pnpm seed:generate`.
- Run `pnpm test`, `pnpm typecheck`, `pnpm lint` before shipping. `pnpm exec next typegen` regenerates `PageProps`/`LayoutProps` after adding routes.

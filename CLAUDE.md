# Foreshadow — notes for agents

- Scorer, windows and verdict live in `packages/core`; they are pure and tested. Never put an LLM in that path.
- `lib/data` is the only way the UI reads data. Demo mode (no Supabase env) reads `supabase/fixtures`; otherwise Supabase.
- `scripts/generate-seed.ts` regenerates fixtures + `supabase/seed.sql` deterministically (`pnpm seed:generate`). The dataset is synthetic.
- `lib/ingest.ts` is the pipeline shared by `/api/cron/ingest` and `pnpm ingest`; it has no Next imports on purpose.
- Design system "marked-up evidence" lives in `app/globals.css`: graph-paper light theme plus a dark twin (system default, toggle stored in localStorage `fs-theme`). One signature: the highlighter (`.hl`, `.hl-band`) marks the footprint window and 70+ scores; pen blue is for chart annotations only. Calls/puts are validated for colour-blind separation per theme (light `#0e8a7a`/`#d23a52`, dark `#1ea5ad`/`#e8604c`).
- Charts are hand-written SVG: `components/event/Trace.tsx` (the Event Card polygraph), `components/viz/TellStrip.tsx` (row sparkline), `components/viz/MoveGauge.tsx`. Every case list uses `components/cases/CaseList.tsx`.
- Custom CSS classes sit in `@layer components` so Tailwind utilities can override them. Fixture JSON is cached per server process: restart `next dev` after `pnpm seed:generate`.
- Run `pnpm test`, `pnpm typecheck`, `pnpm lint` before shipping. `pnpm exec next typegen` regenerates `PageProps`/`LayoutProps` after adding routes.

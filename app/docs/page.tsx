import type { Metadata } from "next";
import Link from "next/link";
import { env } from "@/lib/env";

export const metadata: Metadata = {
  title: "Docs",
  description: "How the Foreshadow Score works, what it reads from Unusual Whales, how verdicts are decided, and how to add Foreshadow to Claude via MCP.",
};

const SIGNALS: [string, string, string, string][] = [
  ["Flow-alert intensity", "/api/option-trades/flow-alerts", "alert count and premium per day vs. baseline; sweep share adds up to +2 z", "25%"],
  ["Directional premium", "same, split by call/put and ask/bid side", "ask-side call premium − ask-side put premium per day; |z| scores, sign sets direction", "20%"],
  ["New open interest", "/api/stock/{t}/oi-change", "sum of |OI change| per day (log1p); call/put imbalance feeds direction", "20%"],
  ["Volume unusualness", "/api/stock/{t}/options-volume → percentile", "0–100 percentile of option volume vs. trailing 90 days, mapped straight onto the weight", "15%"],
  ["Skew shift", "/api/stock/{t}/historical-risk-reversal-skew", "change in 25Δ put−call IV across the window vs. typical 5-day moves", "10%"],
  ["Dark pool prints", "/api/darkpool/{t}", "notional of prints ≥ $1M per day (log1p) vs. baseline", "10%"],
];

export default function DocsPage() {
  const base = env.siteUrl.replace(/\/$/, "");
  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <p className="label mb-2">Docs</p>
      <h1 className="display text-[44px] sm:text-[56px]">How Foreshadow works</h1>
      <p className="mt-3 text-[15px] leading-relaxed text-ink-2">
        Informed money leaves a footprint in options before news. Foreshadow turns that into a repeatable, scored,
        searchable system: one deterministic number per (ticker, event), a direction, and for past events a verdict.
        No model touches the arithmetic; Claude only writes the words.
      </p>

      <nav className="mt-6 flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-ink-2" aria-label="Sections">
        {[
          ["#score", "The score"],
          ["#windows", "Windows"],
          ["#signals", "Signals"],
          ["#verdict", "Verdict"],
          ["#noise", "Noise controls"],
          ["#claude", "Where Claude fits"],
          ["#mcp", "MCP"],
          ["#api", "REST API"],
          ["#byok", "Bring your own key"],
          ["#run", "Run it locally"],
        ].map(([href, label]) => (
          <a key={href} href={href} className="underline decoration-line-strong underline-offset-4 hover:text-ink">{label}</a>
        ))}
      </nav>

      <Section id="score" title="The Foreshadow Score">
        <p>
          Every signal becomes a z-score of the footprint window against the ticker&apos;s own baseline, so a sleepy
          biotech and a mega-cap are comparable. Each z is clipped to [0, 4], scaled to 0–1, weighted and summed:
        </p>
        <pre className="mt-3 overflow-x-auto rounded-md border hairline bg-surface-2 p-3 font-mono text-[12.5px] text-ink">{`Score = Σ_i  w_i · min( max(z_i, 0) / 4, 1 ) · 100`}</pre>
        <p className="mt-3">
          Below 40 is quiet, 40–70 is notable, 70+ is &ldquo;someone knew&rdquo;. Direction is the sign of
          <span className="font-mono text-ink"> z(directional premium) + 2·OI imbalance − z(skew shift)</span>; within ±0.5 it is
          &ldquo;mixed&rdquo;. Dollar metrics are log1p-transformed before the z so one mega-print can&apos;t dominate, and
          every baseline gets a small standard-deviation floor so a near-constant history can&apos;t turn a bump into
          an infinite z.
        </p>
      </Section>

      <Section id="windows" title="Windows">
        <ul className="list-disc space-y-1 pl-5">
          <li><strong className="text-ink">Footprint</strong>: trading days T-5 through T-1 before the event.</li>
          <li><strong className="text-ink">Baseline</strong>: the 60 trading days before that (T-65 → T-6).</li>
          <li><strong className="text-ink">Live Radar</strong>: upcoming events are scored on the part of the footprint window that has already happened and flagged <em>partial</em>.</li>
          <li>The calendar skips weekends and NYSE holidays. If your UW plan limits history, the baseline shrinks to what is available and the event is flagged.</li>
        </ul>
      </Section>

      <Section id="signals" title="Signals">
        <div className="overflow-x-auto rounded-md border hairline">
          <table className="w-full text-[13px]">
            <thead className="label">
              <tr className="border-b hairline text-left">
                <th className="px-3 py-2 font-normal">Signal</th>
                <th className="px-3 py-2 font-normal">UW source</th>
                <th className="px-3 py-2 font-normal">What is computed</th>
                <th className="px-3 py-2 font-normal text-right">Weight</th>
              </tr>
            </thead>
            <tbody>
              {SIGNALS.map(([a, b, c, d]) => (
                <tr key={a} className="border-b hairline last:border-b-0 align-top">
                  <td className="px-3 py-2 text-ink">{a}</td>
                  <td className="px-3 py-2 font-mono text-[11.5px] text-ink-2">{b}</td>
                  <td className="px-3 py-2 text-ink-2">{c}</td>
                  <td className="px-3 py-2 text-right tnum text-ink">{d}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3">
          Catalysts come from <span className="font-mono text-ink">/api/market/fda-calendar</span>,{" "}
          <span className="font-mono text-ink">/api/earnings/premarket</span> and <span className="font-mono text-ink">afterhours</span>,{" "}
          <span className="font-mono text-ink">/api/congress/recent-trades</span> (with the premium{" "}
          <span className="font-mono text-ink">unusual-trades</span> feed and its <span className="font-mono">committee_conflict</span> tag when available),{" "}
          <span className="font-mono text-ink">/api/insider/transactions</span>, <span className="font-mono text-ink">/api/potus/schedule</span> and{" "}
          <span className="font-mono text-ink">/api/market/economic-calendar</span>. Outcomes come from{" "}
          <span className="font-mono text-ink">/api/stock/{"{t}"}/ohlc/1d</span> and{" "}
          <span className="font-mono text-ink">/api/stock/{"{t}"}/interpolated-iv</span>. Every response is cached in the{" "}
          <span className="font-mono text-ink">footprints</span> table, so a 200-event leaderboard costs roughly 10k requests once.
        </p>
      </Section>

      <Section id="verdict" title="Verdict">
        <p>
          For past events the close-to-close move over the reaction window is compared to the implied move. Pre-market and
          intraday catalysts use close(T) vs close(T-1); after-hours catalysts use close(T+1) vs close(T). The footprint
          <strong className="text-ink"> matched</strong> when the move is at least 1× the implied move <em>and</em> its sign agrees with the footprint direction;
          otherwise it <strong className="text-ink">missed</strong>. A &ldquo;mixed&rdquo; direction can never match. The implied move is the earnings expected
          move from UW when present, else the 1-day interpolated implied move the day before; if neither exists a 4% fallback
          is used and labelled as such.
        </p>
      </Section>

      <Section id="noise" title="Noise controls">
        <ul className="list-disc space-y-1 pl-5">
          <li>Index and ETF tickers are scored but never ranked on the leaderboard: they are always busy.</li>
          <li>Fewer than 20 baseline days with any options activity → <em>insufficient history</em>, excluded from the leaderboard.</li>
          <li>Two or more catalysts for one ticker inside the window → flagged <em>multi-catalyst</em> so a spike isn&apos;t misattributed.</li>
          <li>Only events with a verified outcome (matched or missed) rank; pending and data-less events are shown but not ranked.</li>
        </ul>
      </Section>

      <Section id="claude" title="Where Claude fits">
        <p>
          Claude does the parts that need language, never the arithmetic. The <strong className="text-ink">Narrator</strong> writes the three-sentence
          story and the tweet-ready caption on each Event Card from the raw alert rows; every number in the story is checked
          against the input rows and the rows are rendered beside the story so you can verify. The{" "}
          <strong className="text-ink">Catalyst tagger</strong> maps President&apos;s-schedule and economic-calendar rows to tickers with a confidence. The{" "}
          <strong className="text-ink">Investigator</strong> (&ldquo;Ask Foreshadow&rdquo;) runs a short tool loop, capped at six calls, over Foreshadow&apos;s
          three tools plus the Unusual Whales hosted MCP, and shows its tool calls inline. The{" "}
          <strong className="text-ink">Dossier summary</strong> is one paragraph on whether a ticker is a repeat offender. Narrations are cached by
          (ticker, event date, score). Without <span className="font-mono text-ink">ANTHROPIC_API_KEY</span> every surface still works and shows the
          deterministic template instead.
        </p>
      </Section>

      <Section id="mcp" title="Add Foreshadow to Claude or Cursor (MCP)">
        <p>Foreshadow ships a remote MCP server over streamable HTTP. One URL, three tools, no auth.</p>
        <pre className="mt-3 overflow-x-auto rounded-md border hairline bg-surface-2 p-3 font-mono text-[12.5px] text-ink">{`claude mcp add --transport http foreshadow ${base}/api/mcp`}</pre>
        <pre className="mt-2 overflow-x-auto rounded-md border hairline bg-surface-2 p-3 font-mono text-[12.5px] text-ink">{`{
  "mcpServers": {
    "foreshadow": { "type": "url", "url": "${base}/api/mcp" }
  }
}`}</pre>
        <ul className="mt-3 list-disc space-y-1 pl-5">
          <li><span className="font-mono text-ink">foreshadow_score</span> (ticker, eventDate) → score, direction, verdict, signals, top 5 alerts.</li>
          <li><span className="font-mono text-ink">foreshadow_radar</span> (daysAhead = 10, minScore) → ranked upcoming catalysts.</li>
          <li><span className="font-mono text-ink">foreshadow_history</span> (ticker) → every scored catalyst and the hit rate.</li>
        </ul>
        <p className="mt-3">
          For stdio-only clients: <span className="font-mono text-ink">FORESHADOW_URL={base} npx foreshadow-mcp</span> (package in{" "}
          <span className="font-mono">packages/mcp-stdio</span>). Try it in Claude Desktop: &ldquo;did anyone know about VXRA before Sep 18?&rdquo;
        </p>
      </Section>

      <Section id="api" title="REST API">
        <ul className="list-disc space-y-1 pl-5 font-mono text-[12.5px]">
          <li>GET /api/score?ticker=VXRA&amp;eventDate=2026-09-18</li>
          <li>GET /api/radar?daysAhead=10&amp;minScore=40</li>
          <li>GET /api/history?ticker=QNTM</li>
          <li>GET /api/narrate?id=&lt;catalyst id&gt;</li>
          <li>POST /api/ask {"{ question, context }"}</li>
          <li>GET /api/cron/ingest?mode=radar|daily|backfill (Bearer CRON_SECRET)</li>
        </ul>
      </Section>

      <Section id="byok" title="Bring your own key">
        <p>
          Sign in (email magic link or Google) and paste your Unusual Whales API key in <Link href="/settings" className="underline underline-offset-4">Settings</Link>. It is
          stored in Supabase Vault and only decrypted server-side for your own requests: the Ask panel&apos;s UW tools use it,
          and Foreshadow never re-serves UW data to anyone else. Watchlists and alerts (Discord webhook or email) fire from
          the cron when a Live Radar score crosses your threshold.
        </p>
      </Section>

      <Section id="run" title="Run it locally">
        <pre className="overflow-x-auto rounded-md border hairline bg-surface-2 p-3 font-mono text-[12.5px] text-ink">{`git clone <repo> && cd foreshadow && pnpm install
cp .env.example .env     # leave Supabase empty for demo mode, or add a free project
pnpm dev                 # http://localhost:3000 — seeded demo data, no keys needed

# with Supabase (Docker running):
pnpm supabase start && pnpm supabase db reset     # migrations + seed
# with a UW key, backfill real data:
pnpm ingest --mode backfill --days 90 --loop`}</pre>
        <p className="mt-3">
          The seeded dataset is synthetic: fictional tickers, generated by <span className="font-mono">scripts/generate-seed.ts</span> with a
          fixed seed and scored by the real scorer, so the UI demos without a key. Add <span className="font-mono text-ink">UW_API_KEY</span> and run
          the ingest to replace it with real catalysts.
        </p>
      </Section>

      <p className="mt-10 text-[12px] text-ink-3">
        Not financial advice. Foreshadow detects positioning, not intent; a high score is a statistical anomaly, never an
        allegation.
      </p>
    </div>
  );
}

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="mt-10 scroll-mt-20">
      <h2 className="display text-[26px]">{title}</h2>
      <div className="mt-3 text-[14px] leading-relaxed text-ink-2">{children}</div>
    </section>
  );
}

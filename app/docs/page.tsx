import type { Metadata } from "next";
import Link from "next/link";
import { env } from "@/lib/env";
import { getLeaderboard } from "@/lib/data";
import { ToolPlayground } from "@/components/docs/ToolPlayground";
import { ScoreSandbox } from "@/components/docs/ScoreSandbox";

export const metadata: Metadata = {
  title: "How it works",
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

export default async function DocsPage() {
  const base = env.siteUrl.replace(/\/$/, "");
  // The playground starts on the most unusual finished case, so its first run always returns something.
  const [top] = await getLeaderboard({ limit: 1 });
  return (
    <div className="mx-auto max-w-[760px] px-5 py-12 sm:px-8 lg:py-16 [&_span.font-mono]:[overflow-wrap:anywhere]">
      <h1 className="display text-[44px] text-ink sm:text-[60px]">How it works</h1>
      <div className="prose-plain mt-6 space-y-4">
        <p>
          Companies often have news on a known date: the FDA ruling on a drug, a quarterly earnings report. In the days
          before, some traders buy <strong>options</strong>, contracts that pay off if the stock moves a lot. A{" "}
          <strong>call</strong> pays if the stock rises; a <strong>put</strong> pays if it falls.
        </p>
        <p>
          Foreshadow looks at the five trading days before each piece of news and asks: was the betting unusual for this
          stock? It compares those five days with the same stock&apos;s previous 60, gives the betting a score from 0 to
          100, and notes which way the bets leaned. After the news, it checks whether the stock moved further than
          options traders expected, in the direction the bets pointed. If so, the bets were right.
        </p>
        <p>
          The data comes from Unusual Whales. The scoring is plain arithmetic, so anyone can repeat it. Claude, an AI
          model, only writes the short summaries and answers questions. It never sets a score.
        </p>
      </div>

      <h2 className="display mt-20 text-[34px] text-ink">Find your way around</h2>
      <ul className="mt-6 grid gap-2 sm:grid-cols-2">
        {[
          ["/leaderboard", "Past cases", "Every finished case, ranked by how unusual the betting was, and whether it was right. The last 90 days or a year."],
          ["/radar", "Coming up", "A calendar of news in the next five trading days, scored day by day as the betting builds."],
          ["/scorecard", "Scorecard", "How often unusual betting has actually been right, against ordinary betting."],
          ["/ticker/TSLA", "Stock pages", "One stock's whole track record. Use the search box at the top to find any company."],
          ["#mcp", "Ask Claude", "Add Foreshadow to Claude or Cursor as a tool, or ask on any case, stock, Coming up or Scorecard page."],
          ["/guess", "Guess the move", "Five real cases with the result hidden. Call rise or fall, then see if you beat the bets."],
          ["#score", "Try the score", "Move each measurement with a slider and watch the score add up."],
          ["/feed.xml", "RSS feed", "Get new unusual cases in a feed reader or a Discord channel."],
          ["/calendar.ics", "Calendar", "Subscribe to upcoming news in Google, Apple or Outlook calendar."],
        ].map(([href, title, body]) => (
          <li key={href}>
            <a href={href} className="tray group block h-full rounded-[18px] p-5 transition-colors hover:bg-surface-3">
              <span className="block text-[17px] font-semibold text-ink group-hover:underline group-hover:underline-offset-4">{title}</span>
              <span className="mt-1.5 block text-[15px] leading-relaxed text-ink-2">{body}</span>
            </a>
          </li>
        ))}
      </ul>

      <h2 className="display mt-20 text-[34px] text-ink">Words you&apos;ll see</h2>
      <dl className="tray mt-6 grid gap-1.5 p-2 text-[16px]">
        {[
          ["Unusual betting (score)", "0 to 100. How far the options activity in the five days before the news was above this stock's normal level. 40 and up is unusual; 70 and up is very unusual."],
          ["Bets on a rise / a fall", "Which way the money leaned. Mostly calls bought at the asking price means bets on a rise; mostly puts means bets on a fall."],
          ["Expected move", "How big a move options prices implied for the news, in either direction."],
          ["Actual move", "How much the stock really moved: from the close before the news to the close after it."],
          ["Bets were right / wrong", "Right means the stock moved at least as much as expected, and in the direction the bets leaned. Otherwise, wrong."],
          ["Large options trade", "A single trade or burst of trades that Unusual Whales flagged for its size."],
        ].map(([term, def]) => (
          <div key={term} className="card grid gap-1 px-5 py-4 sm:grid-cols-[12rem_minmax(0,1fr)] sm:gap-6">
            <dt className="font-semibold text-ink">{term}</dt>
            <dd className="leading-relaxed text-ink-2">{def}</dd>
          </div>
        ))}
      </dl>

      <h2 className="display mt-20 text-[34px] text-ink">The details</h2>
      <p className="mt-3 text-[16px] leading-relaxed text-ink-2">
        For people who want the exact method, data sources and API.
      </p>
      <nav className="mt-6 flex flex-wrap gap-2 text-[14.5px]" aria-label="Sections">
        {[
          ["#score", "The score"],
          ["#windows", "Time windows"],
          ["#signals", "What's measured"],
          ["#verdict", "Right or wrong"],
          ["#noise", "Avoiding false alarms"],
          ["#claude", "Where Claude fits"],
          ["#mcp", "Use it from Claude"],
          ["#api", "API"],
          ["#byok", "Your own key"],
          ["#run", "Run it yourself"],
        ].map(([href, label]) => (
          <a key={href} href={href} className="pressable rounded-full bg-surface-2 px-3.5 py-1.5 font-medium text-ink-2 hover:bg-surface-3 hover:text-ink">{label}</a>
        ))}
      </nav>

      <Section id="score" title="The Foreshadow Score">
        <p>
          Every signal becomes a z-score of the footprint window against the ticker&apos;s own baseline, so a sleepy
          biotech and a mega-cap are comparable. Each z is clipped to [0, 4], scaled to 0–1, weighted and summed:
        </p>
        <pre className="mt-3 overflow-x-auto well p-4 font-mono text-[13px] text-ink">{`Score = Σ_i  w_i · min( max(z_i, 0) / 4, 1 ) · 100`}</pre>
        <p className="mt-3">
          Below 40 is ordinary, 40 to 70 is unusual, 70+ is very unusual. Direction is the sign of
          <span className="font-mono text-ink"> z(directional premium) + 2·OI imbalance − z(skew shift)</span>; within ±0.5 it is
          &ldquo;mixed&rdquo;. Dollar metrics are log1p-transformed before the z so one mega-print can&apos;t dominate, and
          every baseline gets a small standard-deviation floor so a near-constant history can&apos;t turn a bump into
          an infinite z.
        </p>
        <h3 className="mt-6 text-[18px] font-semibold text-ink">Try it</h3>
        <p className="mt-1">Move a measurement and watch its points change. The presets are real cases.</p>
        <ScoreSandbox />
      </Section>

      <Section id="windows" title="Windows">
        <ul className="list-disc space-y-1 pl-5">
          <li><strong className="text-ink">Footprint</strong>: trading days T-5 through T-1 before the event.</li>
          <li><strong className="text-ink">Baseline</strong>: the 60 trading days before that (T-65 → T-6).</li>
          <li><strong className="text-ink">Coming up</strong>: upcoming events are scored on the part of the footprint window that has already happened and flagged <em>partial</em>.</li>
          <li>The calendar skips weekends and NYSE holidays. If your UW plan limits history, the baseline shrinks to what is available and the event is flagged.</li>
        </ul>
      </Section>

      <Section id="signals" title="Signals">
        <div className="tray overflow-x-auto p-2">
          <table className="w-full border-separate border-spacing-y-1 text-[14px]">
            <thead className="text-[13px] text-ink-3">
              <tr className="text-left">
                <th className="px-3 py-2 font-medium">Signal</th>
                <th className="px-3 py-2 font-medium">UW source</th>
                <th className="px-3 py-2 font-medium">What is computed</th>
                <th className="px-3 py-2 font-medium text-right">Weight</th>
              </tr>
            </thead>
            <tbody>
              {SIGNALS.map(([a, b, c, d]) => (
                <tr key={a} className="bg-surface align-top [&>td:first-child]:rounded-l-xl [&>td:last-child]:rounded-r-xl">
                  <td className="px-3 py-3 font-medium text-ink">{a}</td>
                  <td className="px-3 py-3 font-mono text-[12px] text-ink-2">{b}</td>
                  <td className="px-3 py-3 text-ink-2">{c}</td>
                  <td className="px-3 py-3 text-right font-semibold tnum text-ink">{d}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3">
          The cases on the site are FDA news and earnings, from <span className="font-mono text-ink">/api/market/fda-calendar</span>,{" "}
          <span className="font-mono text-ink">/api/earnings/premarket</span> and <span className="font-mono text-ink">afterhours</span>. The ingest
          can also read other calendars (not shown on the site yet):{" "}
          <span className="font-mono text-ink">/api/congress/recent-trades</span> (with the premium{" "}
          <span className="font-mono text-ink">unusual-trades</span> feed and its <span className="font-mono">committee_conflict</span> tag when available),{" "}
          <span className="font-mono text-ink">/api/insider/transactions</span>, <span className="font-mono text-ink">/api/potus/schedule</span> and{" "}
          <span className="font-mono text-ink">/api/market/economic-calendar</span>. Outcomes come from{" "}
          <span className="font-mono text-ink">/api/stock/{"{t}"}/ohlc/1d</span> and{" "}
          <span className="font-mono text-ink">/api/stock/{"{t}"}/interpolated-iv</span>. Every response is cached in the{" "}
          <span className="font-mono text-ink">footprints</span> table, so scoring a stock a second time is mostly free.
        </p>
      </Section>

      <Section id="verdict" title="Verdict">
        <p>
          For past events the close-to-close move over the reaction window is compared to the implied move. Pre-market and
          intraday catalysts use close(T) vs close(T-1); after-hours catalysts use close(T+1) vs close(T). The footprint
          <strong className="text-ink"> matched</strong> when the move is at least 1× the implied move <em>and</em> its sign agrees with the footprint direction;
          otherwise it <strong className="text-ink">missed</strong>. A &ldquo;mixed&rdquo; direction can never match. Pages split a miss in two:
          &ldquo;Right way, small move&rdquo; when the stock went the way the bets leaned but by less than the implied move, and
          &ldquo;Wrong way&rdquo; when it went against them. The implied move is the earnings expected
          move from UW when present, else the 1-day interpolated implied move the day before; if neither exists a 4% fallback
          is used and labelled as such.
        </p>
      </Section>

      <Section id="noise" title="Noise controls">
        <ul className="list-disc space-y-1 pl-5">
          <li>Index and ETF tickers are scored but never ranked in Past cases: they are always busy.</li>
          <li>Fewer than 20 baseline days with any options activity → <em>insufficient history</em>, left out of Past cases.</li>
          <li>Two or more catalysts for one ticker inside the window → flagged <em>multi-catalyst</em> so a spike isn&apos;t misattributed.</li>
          <li>Only events with a verified outcome (matched or missed) rank; pending and data-less events are shown but not ranked.</li>
        </ul>
      </Section>

      <Section id="claude" title="Where Claude fits">
        <p>
          Claude does the parts that need language, never the arithmetic. The <strong className="text-ink">Narrator</strong> writes the three-sentence
          story and the tweet-ready caption on each case page from the score&apos;s measurements and its largest trades; every number in the
          story is checked against that input, and the largest trades are shown beside the story so you can verify. The{" "}
          <strong className="text-ink">Catalyst tagger</strong> maps President&apos;s-schedule and economic-calendar rows to tickers with a confidence (for the calendars not shown on the site yet). The{" "}
          <strong className="text-ink">Investigator</strong> (the &ldquo;Ask about this case&rdquo; box) runs a short tool loop, capped at four calls, over Foreshadow&apos;s
          five tools plus the Unusual Whales hosted MCP (used for questions about right now, such as the latest options flow),
          and names the sources it used. The{" "}
          <strong className="text-ink">Stock summary</strong> is one paragraph on whether unusual betting keeps showing up before a stock&apos;s news. Narrations are cached by
          (ticker, event date, score). Without <span className="font-mono text-ink">ANTHROPIC_API_KEY</span> every surface still works and shows the
          deterministic template instead.
        </p>
      </Section>

      <Section id="mcp" title="Add Foreshadow to Claude or Cursor (MCP)">
        <p>Foreshadow ships a remote MCP server over streamable HTTP. One URL, five tools, no auth.</p>
        <p className="mt-4 font-medium text-ink">Claude Code</p>
        <pre className="mt-1.5 overflow-x-auto well p-4 font-mono text-[13px] text-ink">{`claude mcp add --transport http foreshadow ${base}/api/mcp`}</pre>
        <p className="mt-4 font-medium text-ink">Claude on the web or Claude Desktop</p>
        <p className="mt-1">
          Settings → Connectors → Add custom connector. Name it Foreshadow and paste{" "}
          <span className="font-mono text-ink">{`${base}/api/mcp`}</span>.
        </p>
        <p className="mt-4 font-medium text-ink">Cursor</p>
        <pre className="mt-1.5 overflow-x-auto well p-4 font-mono text-[13px] text-ink">{`// .cursor/mcp.json
{
  "mcpServers": {
    "foreshadow": { "url": "${base}/api/mcp" }
  }
}`}</pre>
        <ul className="mt-3 list-disc space-y-1 pl-5">
          <li><span className="font-mono text-ink">foreshadow_score</span> (ticker, eventDate) → score, direction, verdict, measurements, the trade count and total, and the 5 largest trades as examples.</li>
          <li><span className="font-mono text-ink">foreshadow_radar</span> (daysAhead = 10, minScore) → ranked upcoming catalysts.</li>
          <li><span className="font-mono text-ink">foreshadow_history</span> (ticker) → every scored catalyst and the hit rate.</li>
          <li><span className="font-mono text-ink">foreshadow_scorecard</span> () → how often unusual betting was right, by kind of news and score band, against ordinary betting.</li>
          <li><span className="font-mono text-ink">foreshadow_similar</span> (ticker, eventDate) → finished cases like this one and how often their bets were right.</li>
        </ul>
        <p className="mt-3">
          The server also offers three prompts, which Claude shows as slash commands: <span className="font-mono text-ink">investigate_case</span>{" "}
          (ticker, date), <span className="font-mono text-ink">week_ahead</span> and <span className="font-mono text-ink">stock_track_record</span>{" "}
          (ticker). Each chains the tools and asks for a short, plain answer. All five tools are read-only.
        </p>
        <h3 className="mt-6 text-[18px] font-semibold text-ink">What it looks like in Claude</h3>
        <div className="tray mt-3 grid gap-2 p-2">
          <p className="card px-4 py-3 text-[15px] text-ink">
            <span className="mb-1 block text-[13px] font-medium text-ink-3">You</span>
            Was there unusual options betting before TENX&apos;s FDA news in August, and has betting like that been right before?
          </p>
          <p className="px-4 py-1 text-[13.5px] text-ink-3">
            Claude calls <span className="font-mono">foreshadow_history</span>, <span className="font-mono">foreshadow_score</span> and{" "}
            <span className="font-mono">foreshadow_similar</span>.
          </p>
          <p className="card px-4 py-3 text-[15px] leading-relaxed text-ink-2">
            <span className="mb-1 block text-[13px] font-medium text-ink-3">Claude</span>
            Yes. The betting before TENX&apos;s Aug 10 TNX-103 results scored 53/100. Puts dominated: about $2.5M against $0.7M in
            calls, and the largest trade was a roughly $983K put bought Aug 7, the last trading day before the news. The bets were
            right: the stock fell about 90%, past the roughly 81% move options had priced in. Of seven similar finished cases, the
            stock moved the bets&apos; way in 5 and beat the expected move in 2. It&apos;s a small sample.
          </p>
        </div>
        <p className="mt-2 text-[13px] text-ink-3">A real exchange with the live server (Claude Sonnet 5.5, Oct 23, 2026), shortened.</p>
        <h3 className="mt-6 text-[18px] font-semibold text-ink">Try the tools here</h3>
        <p className="mt-1">Each tool has a REST twin that returns the same thing. Run one to see exactly what Claude gets.</p>
        <ToolPlayground ticker={top?.catalyst.ticker ?? "TSLA"} eventDate={top?.catalyst.eventDate ?? "2026-10-21"} />
        <p className="mt-3">
          For clients that only run local (stdio) servers, build the small proxy in{" "}
          <span className="font-mono">packages/mcp-stdio</span> with <span className="font-mono text-ink">pnpm --filter foreshadow-mcp build</span>{" "}
          and run <span className="font-mono text-ink">node packages/mcp-stdio/dist/index.js</span> with{" "}
          <span className="font-mono text-ink">FORESHADOW_URL={base}</span>. Then ask: &ldquo;was there unusual options betting before
          Tesla&apos;s Oct 21 earnings?&rdquo;
        </p>
      </Section>

      <Section id="api" title="REST API">
        <ul className="list-disc space-y-1 pl-5 font-mono text-[12.5px]">
          <li>GET /api/score?ticker=TSLA&amp;eventDate=2026-10-21</li>
          <li>GET /api/radar?daysAhead=10&amp;minScore=40</li>
          <li>GET /api/history?ticker=ACAD</li>
          <li>GET /api/scorecard</li>
          <li>GET /api/similar?ticker=TSLA&amp;eventDate=2026-10-21</li>
          <li>GET /api/narrate?id=&lt;catalyst id&gt;</li>
          <li>POST /api/ask {"{ question, context, history? }"}</li>
          <li>GET /feed.xml (optionally ?ticker=TSLA)</li>
          <li>GET /calendar.ics (optionally ?tickers=AAPL,TSLA): upcoming news as a calendar you can subscribe to</li>
          <li>GET /api/cron/ingest?mode=radar|daily|backfill (Bearer CRON_SECRET)</li>
        </ul>
        <p className="mt-3">
          The API and MCP return Foreshadow&apos;s own results, not raw Unusual Whales rows: example trades carry only the day, call or put,
          strike, expiry, amount and whether it was a sweep. For every trade, look the stock up on Unusual Whales.
        </p>
      </Section>

      <Section id="byok" title="Bring your own key">
        <p>
          Sign in (a guest account, or GitHub or Google where enabled; no email needed) and paste your Unusual Whales API key in <Link href="/settings" className="link">Settings</Link>. It is
          stored in Supabase Vault and only decrypted server-side for your own requests: the Ask panel&apos;s UW tools use it,
          and Foreshadow never re-serves UW data to anyone else. Watchlists and Discord-webhook alerts fire from
          the cron when a Coming up score crosses your threshold.
        </p>
      </Section>

      <Section id="run" title="Run it locally">
        <pre className="overflow-x-auto well p-4 font-mono text-[13px] text-ink">{`git clone <repo> && cd foreshadow && pnpm install
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

      <p className="mt-14 text-[14px] text-ink-3">
        Not financial advice. Foreshadow detects positioning, not intent; a high score is a statistical anomaly, never an
        allegation.
      </p>
    </div>
  );
}

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="mt-16 scroll-mt-8">
      <h2 className="display text-[26px] text-ink">{title}</h2>
      <div className="mt-3 text-[16px] leading-relaxed text-ink-2">{children}</div>
    </section>
  );
}

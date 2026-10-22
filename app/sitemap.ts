import type { MetadataRoute } from "next";
import { getLeaderboard, getRadar } from "@/lib/data";
import { env } from "@/lib/env";

export const revalidate = 3600;

/** The main pages, plus every case and stock that appears in Past cases or Coming up. */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = (env.siteUrl.startsWith("http") ? env.siteUrl : `https://${env.siteUrl}`).replace(/\/$/, "");
  const [past, radar] = await Promise.all([getLeaderboard({ limit: 200 }).catch(() => []), getRadar(10).catch(() => [])]);
  const cases = [...radar, ...past];
  const tickers = [...new Set(cases.map((c) => c.catalyst.ticker))];
  return [
    ...["", "/leaderboard", "/radar", "/scorecard", "/docs"].map((p) => ({ url: `${base}${p}`, changeFrequency: "hourly" as const, priority: p === "" ? 1 : 0.8 })),
    ...cases.map((c) => ({ url: `${base}/event/${encodeURIComponent(c.catalyst.id)}`, lastModified: c.computedAt, priority: 0.6 })),
    ...tickers.map((t) => ({ url: `${base}/ticker/${t}`, priority: 0.5 })),
  ];
}

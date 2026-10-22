import type { MetadataRoute } from "next";
import { env } from "@/lib/env";

export default function robots(): MetadataRoute.Robots {
  const base = (env.siteUrl.startsWith("http") ? env.siteUrl : `https://${env.siteUrl}`).replace(/\/$/, "");
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/api/", "/settings", "/auth/"] }],
    sitemap: `${base}/sitemap.xml`,
  };
}

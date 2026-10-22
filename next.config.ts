import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  devIndicators: false,
  // PostHog goes through our own domain so ad blockers don't drop it.
  skipTrailingSlashRedirect: true,
  async rewrites() {
    return [
      { source: "/ingest/static/:path*", destination: "https://us-assets.i.posthog.com/static/:path*" },
      { source: "/ingest/array/:path*", destination: "https://us-assets.i.posthog.com/array/:path*" },
      { source: "/ingest/:path*", destination: "https://us.i.posthog.com/:path*" },
    ];
  },
  // Demo mode reads the seeded fixtures with fs at request time; make sure
  // they ship with the serverless bundle on Vercel.
  outputFileTracingIncludes: {
    "/**": ["./supabase/fixtures/**/*"],
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;

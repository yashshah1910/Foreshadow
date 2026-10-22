import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  devIndicators: false,
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

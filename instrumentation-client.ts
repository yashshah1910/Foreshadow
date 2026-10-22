import posthog from "posthog-js";

// Product analytics. Runs only when a PostHog project key is set, so local
// and demo-mode checkouts send nothing. Events go through our own /ingest
// rewrite (next.config.ts) rather than straight to PostHog.
const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;

if (key) {
  posthog.init(key, {
    api_host: "/ingest",
    ui_host: "https://us.posthog.com",
    defaults: "2025-05-24",
    person_profiles: "identified_only",
  });
}

import posthog from "posthog-js";

/** One product event. A no-op until PostHog has been initialised. */
export function track(event: string, props?: Record<string, string | number | boolean | null | undefined>): void {
  if (!posthog.__loaded) return;
  posthog.capture(event, props);
}

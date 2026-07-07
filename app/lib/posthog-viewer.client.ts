/**
 * Viewer-only PostHog session replay bootstrap.
 * Vite bundles posthog-js without the lazy recorder — import it explicitly.
 * Use `posthog-recorder` (not `recorder`): only posthog-recorder registers
 * `__PosthogExtensions__.initSessionRecording`, which session replay requires.
 */
import "posthog-js/dist/posthog-recorder";
import posthog from "posthog-js";

let active = false;

export function enableViewerPostHogRecording(): void {
  if (active) return;
  active = true;
  posthog.opt_in_capturing();
  // `true` bypasses project sampling / linked-flag gates for this session.
  posthog.startSessionRecording(true);
}

export function disableViewerPostHogRecording(): void {
  if (!active) return;
  active = false;
  posthog.stopSessionRecording();
  posthog.opt_out_capturing();
}

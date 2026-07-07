import { PostHogProvider } from "@posthog/react";
import posthog from "posthog-js";
import { startTransition, StrictMode } from "react";
import { hydrateRoot } from "react-dom/client";
import { HydratedRouter } from "react-router/dom";

import { POSTHOG_PRIVACY_CONFIG } from "~/lib/posthog-privacy";

const token = import.meta.env.VITE_PUBLIC_POSTHOG_TOKEN;
const host = import.meta.env.VITE_PUBLIC_POSTHOG_HOST;

if (token && host) {
  posthog.init(token, {
    api_host: host,
    // Viewer routes opt in via enableViewerPostHogRecording(); admin stays dark.
    opt_out_capturing_by_default: true,
    capture_pageview: false,
    capture_pageleave: false,
    enable_heatmaps: true,
    ...POSTHOG_PRIVACY_CONFIG,
  });
}

startTransition(() => {
  hydrateRoot(
    document,
    <PostHogProvider client={posthog}>
      <StrictMode>
        <HydratedRouter />
      </StrictMode>
    </PostHogProvider>,
  );
});

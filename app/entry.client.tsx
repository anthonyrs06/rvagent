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
    capture_pageview: true,
    capture_pageleave: true,
    // Heatmaps of pointer movement over the canvas are the "where are they
    // looking" signal; replay shows scroll behavior with content masked.
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

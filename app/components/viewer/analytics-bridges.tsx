/**
 * Mounted once inside ViewerScreen. Subscribes to the first-party event
 * pipeline and forwards to PostHog — viewer components never import
 * analytics vendors directly. The share token is hashed before it is
 * attached to any event (tokens are secrets).
 */
import { usePostHog } from "@posthog/react";
import posthog from "posthog-js";
import { useEffect, useRef } from "react";

import { hashIdentifier } from "~/lib/posthog-privacy";
import { SECURITY_EVENT_TYPES } from "~/lib/types";
import { onViewerEvent } from "~/lib/viewer-events.client";

const EVENT_NAME_MAP: Record<string, string> = {
  open: "resume_opened_client",
  page_view: "page_viewed",
  page_dwell: "page_dwell",
  section_dwell: "section_dwell",
  zoom: "zoom",
  reveal_click: "reveal_clicked",
  session_end: "session_ended",
};

export function AnalyticsBridges({ token }: { token: string }) {
  const posthog = usePostHog();
  const tokenHash = useRef<string | null>(null);

  // Viewer-only: opt in to capture + session replay for this route.
  useEffect(() => {
    if (!import.meta.env.VITE_PUBLIC_POSTHOG_TOKEN) return;

    posthog.opt_in_capturing();
    // Override sampling/linked-flag gates; recorder needs CSP script-src for *.posthog.com.
    posthog.startSessionRecording({ sampling: true, linked_flag: true });

    return () => {
      posthog.stopSessionRecording();
      posthog.opt_out_capturing();
    };
  }, [posthog]);

  useEffect(() => {
    if (!import.meta.env.VITE_PUBLIC_POSTHOG_TOKEN) return;
    let cancelled = false;
    void hashIdentifier(token).then((h) => {
      if (!cancelled) tokenHash.current = h;
    });

    const unsubscribe = onViewerEvent((event) => {
      if (!posthog) return;
      // Heartbeats are liveness plumbing, not analytics.
      if (event.type === "heartbeat") return;

      const isSecurity = SECURITY_EVENT_TYPES.has(event.type);
      posthog.capture(isSecurity ? "security_event" : (EVENT_NAME_MAP[event.type] ?? event.type), {
        link_hash: tokenHash.current,
        page_index: event.pageIndex,
        zone_id: event.zoneId,
        value: event.value,
        ...(isSecurity ? { security_type: event.type } : {}),
      });
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [posthog, token]);

  return null;
}

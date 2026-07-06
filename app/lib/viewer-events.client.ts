/**
 * First-party viewer event pipeline (client side).
 *
 * Single funnel for everything the viewer UI observes: components call
 * `emitViewerEvent`, this module batches to /api/viewer/events on an
 * interval, flushes reliably on pagehide via sendBeacon, sends liveness
 * heartbeats, and fans events out to local subscribers (used by the PostHog
 * bridge) without the UI knowing analytics vendors exist.
 */
import type { ClientEvent } from "~/lib/types";
import { EVENTS_ENDPOINT } from "~/lib/viewer-contracts";

const FLUSH_INTERVAL_MS = 5_000;
const HEARTBEAT_INTERVAL_MS = 10_000;
const MAX_QUEUE = 200;

type Listener = (event: ClientEvent) => void;

let queue: ClientEvent[] = [];
const listeners = new Set<Listener>();
let started = false;
let stopped = false;
let flushTimer: ReturnType<typeof setInterval> | null = null;
let heartbeatTimer: ReturnType<typeof setInterval> | null = null;

export function onViewerEvent(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function emitViewerEvent(event: Omit<ClientEvent, "at"> & { at?: number }): void {
  if (stopped) return;
  const full: ClientEvent = { ...event, at: event.at ?? Date.now() };
  queue.push(full);
  if (queue.length > MAX_QUEUE) queue = queue.slice(-MAX_QUEUE);
  for (const listener of listeners) {
    try {
      listener(full);
    } catch {
      // Subscribers must never break the pipeline.
    }
  }
}

async function flush(useBeacon = false): Promise<void> {
  if (queue.length === 0) return;
  const batch = queue.splice(0, 50);
  const body = JSON.stringify({ events: batch });

  if (useBeacon && "sendBeacon" in navigator) {
    navigator.sendBeacon(EVENTS_ENDPOINT, new Blob([body], { type: "application/json" }));
    return;
  }

  try {
    const res = await fetch(EVENTS_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      keepalive: true,
      credentials: "same-origin",
    });
    // Session revoked/expired mid-view: stop generating traffic.
    if (res.status === 401) stopPipeline();
  } catch {
    // Requeue on network failure, capped.
    queue = [...batch, ...queue].slice(0, MAX_QUEUE);
  }
}

function stopPipeline(): void {
  stopped = true;
  if (flushTimer) clearInterval(flushTimer);
  if (heartbeatTimer) clearInterval(heartbeatTimer);
  flushTimer = null;
  heartbeatTimer = null;
}

/**
 * Start batching/heartbeats. Returns a cleanup for React effects. Safe to
 * call once per viewer mount; re-entry is ignored.
 */
export function initViewerEventPipeline(): () => void {
  if (started || typeof window === "undefined") return () => {};
  started = true;
  stopped = false;

  flushTimer = setInterval(() => void flush(), FLUSH_INTERVAL_MS);
  heartbeatTimer = setInterval(() => emitViewerEvent({ type: "heartbeat" }), HEARTBEAT_INTERVAL_MS);

  const onPageHide = () => {
    emitViewerEvent({ type: "session_end" });
    void flush(true);
  };
  const onVisibility = () => {
    if (document.visibilityState === "hidden") void flush(true);
  };
  window.addEventListener("pagehide", onPageHide);
  document.addEventListener("visibilitychange", onVisibility);

  return () => {
    window.removeEventListener("pagehide", onPageHide);
    document.removeEventListener("visibilitychange", onVisibility);
    void flush(true);
    stopPipeline();
    started = false;
  };
}

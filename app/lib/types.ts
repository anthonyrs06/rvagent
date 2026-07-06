/**
 * Shared types used by both server and client code.
 */

export type ZoneKind = "redact" | "section";

/**
 * A rectangular region on a resume page, in normalized page coordinates
 * (0..1 relative to page width/height) so it is resolution-independent.
 * - "redact": pixels are blacked out at serve time; may be revealable.
 * - "section": named region ("Experience", "Skills") used for dwell analytics.
 */
export interface Zone {
  id: string;
  pageIndex: number;
  x: number;
  y: number;
  w: number;
  h: number;
  kind: ZoneKind;
  label: string;
  /** Only meaningful for kind === "redact": viewer may click-to-reveal (logged). */
  revealable?: boolean;
}

export type ResumeStatus = "processing" | "ready" | "failed";

export type LinkStatus = "active" | "paused" | "revoked" | "locked";

export type ViewerEventType =
  | "open"
  | "page_view"
  | "page_dwell"
  | "section_dwell"
  | "zoom"
  | "reveal_click"
  | "heartbeat"
  | "session_end";

export type SecurityEventType =
  | "gate_failed"
  | "print_attempt"
  | "copy_attempt"
  | "contextmenu"
  | "devtools_open"
  | "screenshot_key"
  | "bot_suspected"
  | "forward_suspected"
  | "auto_locked";

/** Payload the viewer client sends to /api/viewer/events (batched). */
export interface ClientEvent {
  type: ViewerEventType | SecurityEventType;
  /** epoch ms on the client when the event happened */
  at: number;
  pageIndex?: number;
  zoneId?: string;
  /** numeric payload: dwell ms, zoom factor, etc. */
  value?: number;
  meta?: Record<string, unknown>;
}

export const SECURITY_EVENT_TYPES: ReadonlySet<string> = new Set([
  "gate_failed",
  "print_attempt",
  "copy_attempt",
  "contextmenu",
  "devtools_open",
  "screenshot_key",
  "bot_suspected",
  "forward_suspected",
  "auto_locked",
] satisfies SecurityEventType[]);

export const TTL_PRESETS = [
  { id: "1d", label: "24 hours", ms: 24 * 60 * 60 * 1000 },
  { id: "7d", label: "7 days", ms: 7 * 24 * 60 * 60 * 1000 },
  { id: "30d", label: "30 days", ms: 30 * 24 * 60 * 60 * 1000 },
  { id: "never", label: "No expiry", ms: null },
] as const;

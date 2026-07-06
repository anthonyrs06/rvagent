/**
 * Contracts between the viewer route (server) and the viewer UI components
 * (client). Client-safe: no server imports.
 */
import type { Zone } from "~/lib/types";

export interface ViewerPageMeta {
  pageIndex: number;
  loWidth: number;
  loHeight: number;
  hiWidth: number;
  hiHeight: number;
}

export interface ViewerData {
  token: string;
  resumeLabel: string;
  recipientLabel: string;
  pageCount: number;
  pages: ViewerPageMeta[];
  /**
   * Zones the client may know about:
   * - all "section" zones (needed for dwell tracking),
   * - "redact" zones only when the link is redacted (needed to draw
   *   click-to-reveal affordances). Coordinates only — never content.
   */
  zones: Zone[];
  redacted: boolean;
  /** Watermark line rendered in the footer so viewers know it's traceable. */
  watermarkNotice: string;
}

export type UnavailableReason =
  | "expired"
  | "revoked"
  | "paused"
  | "locked"
  | "exhausted"
  | "not_ready"
  | "bot";

export type GateActionError = "password" | "challenge" | "blocked" | "rate_limited";

export interface GateData {
  needsPassword: boolean;
  turnstileSiteKey: string | null;
  recipientLabel: string;
}

export type ViewerLoaderData =
  | { mode: "gate"; gate: GateData }
  | { mode: "viewer"; viewer: ViewerData }
  | { mode: "unavailable"; reason: UnavailableReason };

/** Tile URL helper shared by viewer components. Cookie-authorized. */
export function tileUrl(pageIndex: number, tier: "lo" | "hi"): string {
  return `/api/viewer/page/${pageIndex}?tier=${tier}`;
}

export const EVENTS_ENDPOINT = "/api/viewer/events";
export const REVEAL_ENDPOINT = "/api/viewer/reveal";

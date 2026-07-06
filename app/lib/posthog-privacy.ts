/**
 * Single source of truth for what data may leave the browser to PostHog.
 * Pattern follows the posthog-react-router playbook: sanitize URLs before
 * send, hash identifiers, mask everything in session replay by default.
 */
import type { AutocaptureCompatibleElement, DomAutocaptureEvents } from "posthog-js";

// Share tokens are secrets — never let them reach PostHog raw.
const SHARE_TOKEN_PATH = /\/r\/[^/?#]+/g;

function sanitizeUrl(url: string): string {
  return url.replace(SHARE_TOKEN_PATH, "/r/[TOKEN]");
}

const URL_PROPS = [
  "$current_url",
  "$pathname",
  "$referrer",
  "$initial_pathname",
  "$initial_referrer",
  "$prev_pageview_pathname",
] as const;

interface EventLike {
  properties?: Record<string, unknown>;
}

function sanitizeEvent<T extends EventLike | null>(event: T): T {
  if (!event?.properties) return event;
  for (const prop of URL_PROPS) {
    const value = event.properties[prop];
    if (typeof value === "string") {
      event.properties[prop] = sanitizeUrl(value);
    }
  }
  return event;
}

export async function hashIdentifier(value: string): Promise<string> {
  const normalized = value.toLowerCase().trim().replace(/[-.\s/]/g, "");
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(normalized));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export const POSTHOG_PRIVACY_CONFIG = {
  person_profiles: "identified_only" as const,

  autocapture: {
    dom_event_allowlist: ["click"] as DomAutocaptureEvents[],
    element_allowlist: ["a", "button"] as AutocaptureCompatibleElement[],
    css_selector_allowlist: ["[data-ph-capture]"],
    element_attribute_ignorelist: ["data-sensitive"],
  },

  session_recording: {
    maskAllInputs: true,
    // The resume itself renders in <canvas>, which rrweb records as a blank
    // box by default — exactly what we want. Mask all text nodes too so the
    // replay shows *behavior*, never content.
    maskTextSelector: "*",
    maskTextFn: (text: string, element?: HTMLElement | null) => {
      if (element?.closest("[data-ph-unmask]")) return text;
      return "*".repeat(text.trim().length);
    },
    recordHeaders: false,
    recordBody: false,
  },

  before_send: sanitizeEvent,
};

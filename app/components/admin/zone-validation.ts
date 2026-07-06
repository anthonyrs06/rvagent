import type { Zone } from "~/lib/types";

export const MAX_ZONE_LABEL_LENGTH = 40;
/** Smallest accepted zone edge in normalized page units (~0.5% of the page). */
export const MIN_ZONE_SIZE = 0.005;

export type ZonesParseResult = { ok: true; zones: Zone[] } | { ok: false; error: string };

const isFinite01 = (n: unknown): n is number =>
  typeof n === "number" && Number.isFinite(n) && n >= 0 && n <= 1;

/**
 * Parse and validate the `zones` JSON payload posted by the zone editor.
 * Returns normalized zones (trimmed labels, `revealable` only on redact
 * zones) or a human-readable error for the first offending entry.
 */
export function parseZonesPayload(raw: string, pageCount: number): ZonesParseResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, error: "Zones payload is not valid JSON." };
  }
  if (!Array.isArray(parsed)) {
    return { ok: false, error: "Zones payload must be an array." };
  }

  const zones: Zone[] = [];
  for (let i = 0; i < parsed.length; i++) {
    const entry = parsed[i];
    const at = `Zone ${i + 1}`;
    if (!entry || typeof entry !== "object") {
      return { ok: false, error: `${at}: not an object.` };
    }
    const z = entry as Record<string, unknown>;

    if (typeof z.id !== "string" || z.id.trim().length === 0 || z.id.length > 64) {
      return { ok: false, error: `${at}: missing or invalid id.` };
    }
    if (
      typeof z.pageIndex !== "number" ||
      !Number.isInteger(z.pageIndex) ||
      z.pageIndex < 0 ||
      z.pageIndex >= pageCount
    ) {
      return { ok: false, error: `${at}: pageIndex must be an integer within 0..${pageCount - 1}.` };
    }
    if (!isFinite01(z.x) || !isFinite01(z.y) || !isFinite01(z.w) || !isFinite01(z.h)) {
      return { ok: false, error: `${at}: coordinates must be numbers in 0..1.` };
    }
    if (z.w <= MIN_ZONE_SIZE || z.h <= MIN_ZONE_SIZE) {
      return { ok: false, error: `${at}: box is too small.` };
    }
    if (z.kind !== "redact" && z.kind !== "section") {
      return { ok: false, error: `${at}: kind must be "redact" or "section".` };
    }
    if (typeof z.label !== "string") {
      return { ok: false, error: `${at}: label is required.` };
    }
    const label = z.label.trim();
    if (label.length === 0 || label.length > MAX_ZONE_LABEL_LENGTH) {
      return { ok: false, error: `${at}: label must be 1..${MAX_ZONE_LABEL_LENGTH} characters.` };
    }
    if (z.revealable !== undefined && typeof z.revealable !== "boolean") {
      return { ok: false, error: `${at}: revealable must be a boolean.` };
    }

    const zone: Zone = {
      id: z.id,
      pageIndex: z.pageIndex,
      x: z.x,
      y: z.y,
      w: z.w,
      h: z.h,
      kind: z.kind,
      label,
    };
    if (z.kind === "redact") {
      zone.revealable = z.revealable === true;
    }
    zones.push(zone);
  }

  return { ok: true, zones };
}

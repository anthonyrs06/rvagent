/**
 * Pure geometry/zoom helpers for the viewer. No DOM access — callers pass
 * measured rects in, which keeps every tracking decision unit-testable.
 */
import type { Zone } from "~/lib/types";

export const MIN_ZOOM = 0.6;
export const MAX_ZOOM = 3.0;
export const ZOOM_STEP = 0.2;
/** Above this zoom the lo tier looks soft, so visible pages upgrade to hi. */
export const HI_TIER_THRESHOLD = 1.4;

/** Structural subset of DOMRect so tests don't need a DOM. */
export interface RectLike {
  top: number;
  bottom: number;
  left: number;
  right: number;
  width: number;
  height: number;
}

export interface PageRectEntry {
  pageIndex: number;
  rect: RectLike;
}

export function clampZoom(zoom: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));
}

/** Button zoom: ±0.2, rounded to kill IEEE754 drift, clamped to range. */
export function stepZoom(zoom: number, direction: 1 | -1): number {
  return clampZoom(Math.round((zoom + direction * ZOOM_STEP) * 10) / 10);
}

export function shouldUseHiTier(zoom: number): boolean {
  return zoom > HI_TIER_THRESHOLD;
}

/**
 * Cache-busting param for post-reveal refetches. The tile endpoint ignores
 * unknown params; tile URLs always carry ?tier=, so & is safe.
 */
export function withVersion(url: string, version: number): string {
  return version > 0 ? `${url}&v=${version}` : url;
}

/**
 * The page occupying the viewport's vertical center. Falls back to the
 * nearest page when the center line sits in the gap between pages, so dwell
 * ticks and the "Page X / N" readout never dead-zone.
 */
export function centerPageIndex(pages: PageRectEntry[], centerY: number): number | null {
  let nearest: number | null = null;
  let nearestDistance = Number.POSITIVE_INFINITY;
  for (const { pageIndex, rect } of pages) {
    if (rect.top <= centerY && rect.bottom >= centerY) return pageIndex;
    const distance = Math.min(Math.abs(rect.top - centerY), Math.abs(rect.bottom - centerY));
    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearest = pageIndex;
    }
  }
  return nearest;
}

/** Maps a normalized (0..1) zone rect onto a page's measured viewport rect. */
export function zoneViewportRect(
  pageRect: RectLike,
  zone: Pick<Zone, "x" | "y" | "w" | "h">,
): RectLike {
  const left = pageRect.left + zone.x * pageRect.width;
  const top = pageRect.top + zone.y * pageRect.height;
  const width = zone.w * pageRect.width;
  const height = zone.h * pageRect.height;
  return { left, top, width, height, right: left + width, bottom: top + height };
}

/**
 * Section zones currently intersecting the middle 60% band of the viewport
 * (the "reading zone"). Zones on unmeasured pages or scrolled off
 * horizontally don't count.
 */
export function sectionsInBand(
  zones: Zone[],
  pageRects: Map<number, RectLike>,
  viewportWidth: number,
  viewportHeight: number,
): Zone[] {
  const bandTop = viewportHeight * 0.2;
  const bandBottom = viewportHeight * 0.8;
  const hits: Zone[] = [];
  for (const zone of zones) {
    if (zone.kind !== "section") continue;
    const pageRect = pageRects.get(zone.pageIndex);
    if (!pageRect) continue;
    const r = zoneViewportRect(pageRect, zone);
    const verticallyInBand = r.top < bandBottom && r.bottom > bandTop;
    const horizontallyVisible = r.left < viewportWidth && r.right > 0;
    if (verticallyInBand && horizontallyVisible) hits.push(zone);
  }
  return hits;
}

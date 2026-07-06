/**
 * Dwell/lifecycle tracking. Owns the event pipeline lifecycle, the one-time
 * "open", and the 1s dwell ticker that attributes attention to pages
 * (viewport center) and section zones (middle 60% band), flushing
 * accumulators every 5s and on teardown/pagehide.
 */
import { useEffect, useRef, type RefObject } from "react";

import type { ViewerData } from "~/lib/viewer-contracts";
import { emitViewerEvent, initViewerEventPipeline } from "~/lib/viewer-events.client";
import { centerPageIndex, sectionsInBand, type PageRectEntry } from "./viewer-geometry";

const TICK_MS = 1_000;
const FLUSH_MS = 5_000;

export function useViewerTracking(
  viewer: ViewerData,
  pageEls: RefObject<Map<number, HTMLElement>>,
): void {
  // Survives StrictMode's dev-only remount so "open" really fires once.
  const openEmitted = useRef(false);

  useEffect(() => {
    const sections = viewer.zones.filter((zone) => zone.kind === "section");
    const zoneById = new Map(sections.map((zone) => [zone.id, zone]));
    const pageDwellMs = new Map<number, number>();
    const sectionDwellMs = new Map<string, number>();

    const flushDwell = () => {
      for (const [pageIndex, value] of pageDwellMs) {
        if (value > 0) emitViewerEvent({ type: "page_dwell", pageIndex, value });
      }
      pageDwellMs.clear();
      for (const [zoneId, value] of sectionDwellMs) {
        const zone = zoneById.get(zoneId);
        if (zone && value > 0) {
          emitViewerEvent({ type: "section_dwell", pageIndex: zone.pageIndex, zoneId, value });
        }
      }
      sectionDwellMs.clear();
    };

    const tick = () => {
      if (document.visibilityState !== "visible") return;
      const entries: PageRectEntry[] = [...pageEls.current.entries()].map(([pageIndex, el]) => ({
        pageIndex,
        rect: el.getBoundingClientRect(),
      }));
      if (entries.length === 0) return;

      const centerIndex = centerPageIndex(entries, window.innerHeight / 2);
      if (centerIndex !== null) {
        pageDwellMs.set(centerIndex, (pageDwellMs.get(centerIndex) ?? 0) + TICK_MS);
      }

      const rects = new Map(entries.map((entry) => [entry.pageIndex, entry.rect]));
      for (const zone of sectionsInBand(sections, rects, window.innerWidth, window.innerHeight)) {
        sectionDwellMs.set(zone.id, (sectionDwellMs.get(zone.id) ?? 0) + TICK_MS);
      }
    };

    const onPageHide = () => flushDwell();
    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") flushDwell();
    };

    // Registered BEFORE the pipeline's own pagehide/visibility listeners so
    // the remainder lands in the queue before its final beacon flush.
    window.addEventListener("pagehide", onPageHide);
    document.addEventListener("visibilitychange", onVisibilityChange);

    const stopPipeline = initViewerEventPipeline();
    if (!openEmitted.current) {
      openEmitted.current = true;
      emitViewerEvent({ type: "open" });
    }

    const tickTimer = setInterval(tick, TICK_MS);
    const flushTimer = setInterval(flushDwell, FLUSH_MS);

    return () => {
      clearInterval(tickTimer);
      clearInterval(flushTimer);
      window.removeEventListener("pagehide", onPageHide);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      flushDwell();
      stopPipeline();
    };
  }, [viewer, pageEls]);
}

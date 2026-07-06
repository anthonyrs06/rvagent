import { describe, expect, it } from "vitest";

import type { Zone } from "~/lib/types";
import {
  centerPageIndex,
  clampZoom,
  MAX_ZOOM,
  MIN_ZOOM,
  sectionsInBand,
  shouldUseHiTier,
  stepZoom,
  withVersion,
  zoneViewportRect,
  type RectLike,
} from "../viewer-geometry";

function rect(top: number, height: number, left = 0, width = 800): RectLike {
  return { top, bottom: top + height, left, right: left + width, width, height };
}

function sectionZone(overrides: Partial<Zone> & { id: string }): Zone {
  return {
    pageIndex: 0,
    x: 0.1,
    y: 0.1,
    w: 0.8,
    h: 0.2,
    kind: "section",
    label: "Experience",
    ...overrides,
  };
}

describe("clampZoom", () => {
  it("passes through values inside the range", () => {
    expect(clampZoom(1)).toBe(1);
    expect(clampZoom(2.4)).toBe(2.4);
  });

  it("clamps to the 0.6..3.0 range", () => {
    expect(clampZoom(0.1)).toBe(MIN_ZOOM);
    expect(clampZoom(99)).toBe(MAX_ZOOM);
  });
});

describe("stepZoom", () => {
  it("steps by 0.2 in either direction", () => {
    expect(stepZoom(1, 1)).toBe(1.2);
    expect(stepZoom(1, -1)).toBe(0.8);
  });

  it("avoids floating point drift", () => {
    // 1.1 + 0.2 = 1.3000000000000003 in raw IEEE754.
    expect(stepZoom(1.1, 1)).toBe(1.3);
  });

  it("clamps at the bounds", () => {
    expect(stepZoom(2.9, 1)).toBe(MAX_ZOOM);
    expect(stepZoom(MIN_ZOOM, -1)).toBe(MIN_ZOOM);
    expect(stepZoom(MAX_ZOOM, 1)).toBe(MAX_ZOOM);
  });
});

describe("shouldUseHiTier", () => {
  it("stays on lo at or below 1.4", () => {
    expect(shouldUseHiTier(1)).toBe(false);
    expect(shouldUseHiTier(1.4)).toBe(false);
  });

  it("upgrades above 1.4", () => {
    expect(shouldUseHiTier(1.6)).toBe(true);
    expect(shouldUseHiTier(3)).toBe(true);
  });
});

describe("withVersion", () => {
  it("leaves the url untouched for version 0", () => {
    expect(withVersion("/api/viewer/page/0?tier=lo", 0)).toBe("/api/viewer/page/0?tier=lo");
  });

  it("appends a cache-busting param for later versions", () => {
    expect(withVersion("/api/viewer/page/0?tier=lo", 2)).toBe("/api/viewer/page/0?tier=lo&v=2");
  });
});

describe("centerPageIndex", () => {
  it("returns null when there are no pages", () => {
    expect(centerPageIndex([], 400)).toBeNull();
  });

  it("picks the page containing the center line", () => {
    const pages = [
      { pageIndex: 0, rect: rect(-500, 600) }, // ends at 100
      { pageIndex: 1, rect: rect(124, 600) }, // 124..724 contains 400
    ];
    expect(centerPageIndex(pages, 400)).toBe(1);
  });

  it("falls back to the nearest page when the center is in a gap", () => {
    const pages = [
      { pageIndex: 0, rect: rect(-600, 990) }, // ends at 390, 10px above center
      { pageIndex: 1, rect: rect(440, 600) }, // starts 40px below center
    ];
    expect(centerPageIndex(pages, 400)).toBe(0);
  });
});

describe("zoneViewportRect", () => {
  it("maps normalized coords onto the page's viewport rect", () => {
    const page: RectLike = rect(100, 400, 50, 200);
    const zone = zoneViewportRect(page, { x: 0.25, y: 0.5, w: 0.5, h: 0.25 });
    expect(zone).toEqual({ left: 100, top: 300, width: 100, height: 100, right: 200, bottom: 400 });
  });
});

describe("sectionsInBand", () => {
  const viewportWidth = 800;
  const viewportHeight = 1000; // band = 200..800

  it("includes a section inside the middle band", () => {
    const zone = sectionZone({ id: "s1", y: 0.1, h: 0.2 });
    // Page fills the viewport: zone spans 100..300, overlapping band start.
    const pageRects = new Map([[0, rect(0, 1000)]]);
    const hit = sectionsInBand([zone], pageRects, viewportWidth, viewportHeight);
    expect(hit.map((z) => z.id)).toEqual(["s1"]);
  });

  it("excludes sections outside the band", () => {
    const above = sectionZone({ id: "above", y: 0, h: 0.1 }); // 0..100, band starts at 200
    const below = sectionZone({ id: "below", y: 0.9, h: 0.1 }); // 900..1000, band ends at 800
    const pageRects = new Map([[0, rect(0, 1000)]]);
    expect(sectionsInBand([above, below], pageRects, viewportWidth, viewportHeight)).toEqual([]);
  });

  it("excludes sections on pages that are not measured", () => {
    const zone = sectionZone({ id: "s1", pageIndex: 3 });
    expect(sectionsInBand([zone], new Map(), viewportWidth, viewportHeight)).toEqual([]);
  });

  it("excludes sections scrolled off horizontally", () => {
    const zone = sectionZone({ id: "s1" });
    const pageRects = new Map([[0, rect(0, 1000, -2000, 900)]]); // fully left of viewport
    expect(sectionsInBand([zone], pageRects, viewportWidth, viewportHeight)).toEqual([]);
  });

  it("ignores redact zones", () => {
    const redact = sectionZone({ id: "r1", kind: "redact" });
    const pageRects = new Map([[0, rect(0, 1000)]]);
    expect(sectionsInBand([redact], pageRects, viewportWidth, viewportHeight)).toEqual([]);
  });
});

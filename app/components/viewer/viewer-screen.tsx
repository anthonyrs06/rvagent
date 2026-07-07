import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { Zone } from "~/lib/types";
import { REVEAL_ENDPOINT, type ViewerData } from "~/lib/viewer-contracts";
import { emitViewerEvent } from "~/lib/viewer-events.client";
import { AnalyticsBridges } from "./analytics-bridges";
import { CanvasPage } from "./canvas-page";
import { useProtection } from "./use-protection";
import { useViewerTracking } from "./use-tracking";
import { centerPageIndex, clampZoom, shouldUseHiTier, stepZoom } from "./viewer-geometry";
import { ViewerToolbar } from "./viewer-toolbar";
import "./viewer.css";

const ZOOM_EMIT_DEBOUNCE_MS = 500;

export function ViewerScreen({ viewer }: { viewer: ViewerData }) {
  const [zoom, setZoom] = useState(1);
  const [currentPage, setCurrentPage] = useState(0);
  const [revealedZoneIds, setRevealedZoneIds] = useState<ReadonlySet<string>>(new Set());
  const [pageVersions, setPageVersions] = useState<Readonly<Record<number, number>>>({});
  const pageEls = useRef(new Map<number, HTMLElement>());

  const { inactive, devtoolsOpen, screenshotGuard } = useProtection();
  useViewerTracking(viewer, pageEls);

  const registerPageEl = useCallback((pageIndex: number, el: HTMLElement | null) => {
    if (el) pageEls.current.set(pageIndex, el);
    else pageEls.current.delete(pageIndex);
  }, []);

  // "Page X / N" follows the page at the viewport's vertical center.
  useEffect(() => {
    let raf = 0;
    const update = () => {
      raf = 0;
      const entries = [...pageEls.current.entries()].map(([pageIndex, el]) => ({
        pageIndex,
        rect: el.getBoundingClientRect(),
      }));
      const index = centerPageIndex(entries, window.innerHeight / 2);
      if (index !== null) setCurrentPage(index);
    };
    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    schedule();
    return () => {
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  // Ctrl/Cmd + wheel zoom (trackpad pinch reports as ctrl+wheel too).
  useEffect(() => {
    const onWheel = (event: WheelEvent) => {
      if (!(event.ctrlKey || event.metaKey)) return;
      event.preventDefault();
      setZoom((z) => clampZoom(z * Math.exp(-event.deltaY * 0.0015)));
    };
    window.addEventListener("wheel", onWheel, { passive: false });
    return () => window.removeEventListener("wheel", onWheel);
  }, []);

  // Debounced zoom analytics: one event per settled zoom level.
  const lastEmittedZoom = useRef(1);
  useEffect(() => {
    if (zoom === lastEmittedZoom.current) return;
    const timer = setTimeout(() => {
      lastEmittedZoom.current = zoom;
      emitViewerEvent({ type: "zoom", value: Math.round(zoom * 100) / 100 });
    }, ZOOM_EMIT_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [zoom]);

  const handleReveal = useCallback(async (zone: Zone): Promise<boolean> => {
    try {
      const res = await fetch(REVEAL_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ zoneId: zone.id }),
        credentials: "same-origin",
      });
      if (!res.ok) return false;
      emitViewerEvent({ type: "reveal_click", pageIndex: zone.pageIndex, zoneId: zone.id });
      setRevealedZoneIds((previous) => new Set(previous).add(zone.id));
      // Version bump forces the page's tiles to re-fetch unredacted pixels.
      setPageVersions((previous) => ({
        ...previous,
        [zone.pageIndex]: (previous[zone.pageIndex] ?? 0) + 1,
      }));
      return true;
    } catch {
      return false;
    }
  }, []);

  const revealZonesByPage = useMemo(() => {
    const byPage = new Map<number, Zone[]>();
    if (!viewer.redacted) return byPage;
    for (const zone of viewer.zones) {
      if (zone.kind !== "redact" || !zone.revealable || revealedZoneIds.has(zone.id)) continue;
      const list = byPage.get(zone.pageIndex) ?? [];
      list.push(zone);
      byPage.set(zone.pageIndex, list);
    }
    return byPage;
  }, [viewer.redacted, viewer.zones, revealedZoneIds]);

  const hideContent = inactive || devtoolsOpen || screenshotGuard;
  const useHi = shouldUseHiTier(zoom);

  const contentHiddenClass = hideContent
    ? screenshotGuard
      ? "opacity-0 blur-2xl brightness-0 transition-none"
      : "blur-md brightness-50 transition"
    : "transition";

  return (
    <main className="rv-viewer-root rv-noselect min-h-svh select-none bg-gray-950">
      <AnalyticsBridges token={viewer.token} />

      {devtoolsOpen && (
        <div className="fixed inset-x-0 top-0 z-50 bg-amber-500 px-4 py-2 text-center text-sm font-medium text-gray-950">
          Developer tools detected — this session is logged.
        </div>
      )}

      {screenshotGuard && (
        <div className="rv-guard-banner fixed inset-x-0 top-0 z-50 bg-red-600 px-4 py-2 text-center text-sm font-medium text-white">
          Screenshot attempt detected — this session is logged.
        </div>
      )}

      <div className={contentHiddenClass}>
        <ViewerToolbar
          recipientLabel={viewer.recipientLabel}
          zoom={zoom}
          currentPage={currentPage}
          pageCount={viewer.pageCount}
          onZoomIn={() => setZoom((z) => stepZoom(z, 1))}
          onZoomOut={() => setZoom((z) => stepZoom(z, -1))}
          onFit={() => setZoom(1)}
        />

        {/* Deliberately no accessible text layer: pixels only. */}
        <div aria-hidden="true" className="relative">
          <div className="overflow-x-auto">
            <div
              className="mx-auto flex flex-col items-center gap-6 px-3 py-6 sm:px-6 sm:py-10"
              style={{ width: `calc(min(100%, 900px) * ${zoom})` }}
            >
              {viewer.pages.map((page) => (
                <CanvasPage
                  key={page.pageIndex}
                  meta={page}
                  useHiTier={useHi}
                  version={pageVersions[page.pageIndex] ?? 0}
                  revealZones={revealZonesByPage.get(page.pageIndex) ?? []}
                  onReveal={handleReveal}
                  registerEl={registerPageEl}
                />
              ))}
            </div>
          </div>

          {inactive && !screenshotGuard && (
            <div className="pointer-events-none fixed inset-0 z-40 flex items-center justify-center px-6">
              <p className="rounded-lg border border-gray-800 bg-gray-950/90 px-6 py-4 text-center text-sm font-medium text-gray-200 shadow-2xl">
                Content hidden while the window is inactive
              </p>
            </div>
          )}
        </div>

        <footer className="px-4 pb-10 text-center text-xs text-gray-500">
          {viewer.watermarkNotice} · Downloads and copying are disabled.
        </footer>
      </div>
    </main>
  );
}

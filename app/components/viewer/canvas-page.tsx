import { useEffect, useRef, useState } from "react";

import type { Zone } from "~/lib/types";
import { tileUrl, type ViewerPageMeta } from "~/lib/viewer-contracts";
import { emitViewerEvent } from "~/lib/viewer-events.client";
import { RevealOverlay } from "./reveal-overlay";
import { withVersion } from "./viewer-geometry";

type Tier = "lo" | "hi";

const LAZY_ROOT_MARGIN = "600px 0px";
const VIEW_THRESHOLDS = [0, 0.25, 0.5, 0.75, 1];

/**
 * One resume page. Pixels only ever exist inside a <canvas> backing store —
 * there is no <img> element to long-press, drag out, or "open in new tab".
 */
export function CanvasPage({
  meta,
  useHiTier,
  version,
  revealZones,
  onReveal,
  registerEl,
}: {
  meta: ViewerPageMeta;
  useHiTier: boolean;
  /** Bumped after a reveal so tiles are re-fetched past the browser cache. */
  version: number;
  revealZones: Zone[];
  onReveal: (zone: Zone) => Promise<boolean>;
  registerEl: (pageIndex: number, el: HTMLElement | null) => void;
}) {
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [nearViewport, setNearViewport] = useState(false);
  const [hasDrawn, setHasDrawn] = useState(false);
  /** Last version fetched per tier; -1 means never (allows retry on error). */
  const fetchedVersion = useRef<Record<Tier, number>>({ lo: -1, hi: -1 });
  const drawn = useRef<{ tier: Tier | null; version: number }>({ tier: null, version: -1 });
  const pageViewEmitted = useRef(false);

  // Lazy-load trigger: start fetching when within ~600px of the viewport.
  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setNearViewport(true);
          observer.disconnect();
        }
      },
      { rootMargin: LAZY_ROOT_MARGIN },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // page_view: first time the page is meaningfully visible. Tall/zoomed pages
  // can never reach ratio 0.5, so "fills half the viewport" also counts.
  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (pageViewEmitted.current) return;
          const viewportHeight = entry.rootBounds?.height ?? window.innerHeight;
          const fillsHalfViewport = entry.intersectionRect.height >= viewportHeight * 0.5;
          if (entry.intersectionRatio >= 0.5 || fillsHalfViewport) {
            pageViewEmitted.current = true;
            emitViewerEvent({ type: "page_view", pageIndex: meta.pageIndex });
            observer.disconnect();
            return;
          }
        }
      },
      { threshold: VIEW_THRESHOLDS },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [meta.pageIndex]);

  // Tile fetching: lo first, hi once zoomed in, everything re-fetched when
  // the version bumps after a reveal. A lower tier never paints over a
  // higher one from the same version.
  useEffect(() => {
    if (!nearViewport) return;
    const controller = new AbortController();

    const load = async (tier: Tier) => {
      if (fetchedVersion.current[tier] >= version) return;
      fetchedVersion.current[tier] = version;
      try {
        const res = await fetch(withVersion(tileUrl(meta.pageIndex, tier), version), {
          credentials: "same-origin",
          signal: controller.signal,
        });
        if (!res.ok) throw new Error(`tile fetch failed: ${res.status}`);
        const blob = await res.blob();
        const bitmap = await createImageBitmap(blob);

        const tierRank = tier === "hi" ? 1 : 0;
        const drawnRank = drawn.current.tier === "hi" ? 1 : drawn.current.tier === "lo" ? 0 : -1;
        if (version > drawn.current.version || tierRank >= drawnRank) {
          const canvas = canvasRef.current;
          const ctx = canvas?.getContext("2d");
          if (canvas && ctx) {
            canvas.width = bitmap.width;
            canvas.height = bitmap.height;
            ctx.drawImage(bitmap, 0, 0);
            drawn.current = { tier, version };
            setHasDrawn(true);
          }
        }
        bitmap.close();
      } catch {
        // Aborted or failed: allow the next effect run to retry this tier.
        if (fetchedVersion.current[tier] === version) fetchedVersion.current[tier] = -1;
      }
    };

    void load("lo");
    if (useHiTier) void load("hi");

    return () => controller.abort();
  }, [nearViewport, useHiTier, version, meta.pageIndex]);

  return (
    <div
      ref={(el) => {
        wrapperRef.current = el;
        registerEl(meta.pageIndex, el);
      }}
      className="relative w-full overflow-hidden rounded-md bg-gray-900 shadow-xl shadow-black/40 ring-1 ring-gray-800"
    >
      <canvas
        ref={canvasRef}
        width={meta.loWidth}
        height={meta.loHeight}
        className="block h-auto w-full"
      />
      {!hasDrawn && <div className="absolute inset-0 animate-pulse bg-gray-800/60" />}
      {revealZones.map((zone) => (
        <RevealOverlay key={zone.id} zone={zone} onReveal={onReveal} />
      ))}
    </div>
  );
}

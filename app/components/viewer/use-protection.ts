/**
 * Protection pack: deterrence listeners active only while the viewer is
 * mounted. Blocking is best-effort (a determined viewer can photograph a
 * screen); the real product is that every attempt is *observed*, so each
 * security event type is emitted at most once per session while the
 * prevention itself keeps running.
 */
import { useEffect, useRef, useState } from "react";

import { isScreenshotModifierPrep, isScreenshotShortcut } from "~/lib/screenshot-shortcuts";
import type { SecurityEventType } from "~/lib/types";
import { emitViewerEvent } from "~/lib/viewer-events.client";

const DEVTOOLS_POLL_MS = 2_000;
const DEVTOOLS_GAP_PX = 240;
/** How long content stays hidden after a detected screenshot shortcut. */
const SCREENSHOT_GUARD_MS = 8_000;

// Session-scoped (page-load-scoped) dedupe, matching "once per session".
const emittedTypes = new Set<SecurityEventType>();

function emitOnce(type: SecurityEventType): void {
  if (emittedTypes.has(type)) return;
  emittedTypes.add(type);
  emitViewerEvent({ type });
}

function clearScreenshotClipboard(): void {
  try {
    void navigator.clipboard?.writeText("").catch(() => {});
  } catch {
    // Clipboard API unavailable — fine.
  }
}

export interface ProtectionState {
  /** Window blurred or tab hidden — callers blur the content. */
  inactive: boolean;
  /** Devtools heuristic currently firing — callers show the banner + blur. */
  devtoolsOpen: boolean;
  /** Screenshot shortcut detected — hide pixels immediately. */
  screenshotGuard: boolean;
}

export function useProtection(): ProtectionState {
  const [inactive, setInactive] = useState(false);
  const [devtoolsOpen, setDevtoolsOpen] = useState(false);
  const [screenshotGuard, setScreenshotGuard] = useState(false);
  const guardTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const triggerScreenshotGuard = () => {
      // Synchronous DOM hide first — a React re-render can lose the race
      // against the OS screenshot capture, a class toggle cannot.
      document.documentElement.classList.add("rv-screenshot-guard");
      emitOnce("screenshot_key");
      setScreenshotGuard(true);
      clearScreenshotClipboard();
      if (guardTimer.current) clearTimeout(guardTimer.current);
      guardTimer.current = setTimeout(() => {
        document.documentElement.classList.remove("rv-screenshot-guard");
        setScreenshotGuard(false);
      }, SCREENSHOT_GUARD_MS);
    };

    const onContextMenu = (event: Event) => {
      event.preventDefault();
      emitOnce("contextmenu");
    };

    const onCopyOrCut = (event: Event) => {
      event.preventDefault();
      emitOnce("copy_attempt");
    };

    const onSelectOrDrag = (event: Event) => {
      event.preventDefault();
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (isScreenshotModifierPrep(event) || isScreenshotShortcut(event)) {
        event.preventDefault();
        triggerScreenshotGuard();
        return;
      }

      if (!(event.ctrlKey || event.metaKey)) return;
      const key = event.key.toLowerCase();
      if (key !== "s" && key !== "p" && key !== "c" && key !== "a") return;
      event.preventDefault();
      if (key === "p") emitOnce("print_attempt");
      if (key === "c" || key === "s") emitOnce("copy_attempt");
    };

    const onKeyUp = (event: KeyboardEvent) => {
      if (event.key !== "PrintScreen") return;
      triggerScreenshotGuard();
    };

    const onBeforePrint = () => emitOnce("print_attempt");
    const printMedia = window.matchMedia("print");
    const onPrintMediaChange = (event: MediaQueryListEvent) => {
      if (event.matches) emitOnce("print_attempt");
    };

    const onBlur = () => setInactive(true);
    const onFocus = () => setInactive(false);
    const onVisibilityChange = () => setInactive(document.visibilityState === "hidden");

    document.addEventListener("contextmenu", onContextMenu);
    document.addEventListener("copy", onCopyOrCut);
    document.addEventListener("cut", onCopyOrCut);
    document.addEventListener("selectstart", onSelectOrDrag);
    document.addEventListener("dragstart", onSelectOrDrag);
    document.addEventListener("keydown", onKeyDown, true);
    document.addEventListener("keyup", onKeyUp, true);
    window.addEventListener("beforeprint", onBeforePrint);
    printMedia.addEventListener("change", onPrintMediaChange);
    window.addEventListener("blur", onBlur);
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibilityChange);

    // Devtools window-chrome heuristic. Touch devices and small screens
    // false-positive constantly (browser UI, keyboards), so skip them.
    const isTouchOrSmall =
      navigator.maxTouchPoints > 0 || "ontouchstart" in window || window.innerWidth < 768;
    let devtoolsTimer: ReturnType<typeof setInterval> | null = null;
    if (!isTouchOrSmall) {
      devtoolsTimer = setInterval(() => {
        const detected =
          window.outerWidth - window.innerWidth > DEVTOOLS_GAP_PX ||
          window.outerHeight - window.innerHeight > DEVTOOLS_GAP_PX;
        setDevtoolsOpen((previous) => {
          if (detected && !previous) emitOnce("devtools_open");
          return detected;
        });
      }, DEVTOOLS_POLL_MS);
    }

    return () => {
      document.removeEventListener("contextmenu", onContextMenu);
      document.removeEventListener("copy", onCopyOrCut);
      document.removeEventListener("cut", onCopyOrCut);
      document.removeEventListener("selectstart", onSelectOrDrag);
      document.removeEventListener("dragstart", onSelectOrDrag);
      document.removeEventListener("keydown", onKeyDown, true);
      document.removeEventListener("keyup", onKeyUp, true);
      window.removeEventListener("beforeprint", onBeforePrint);
      printMedia.removeEventListener("change", onPrintMediaChange);
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      if (devtoolsTimer) clearInterval(devtoolsTimer);
      if (guardTimer.current) clearTimeout(guardTimer.current);
      document.documentElement.classList.remove("rv-screenshot-guard");
    };
  }, []);

  return { inactive, devtoolsOpen, screenshotGuard };
}

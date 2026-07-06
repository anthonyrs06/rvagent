import { useEffect, useRef, useState } from "react";
import { useRevalidator } from "react-router";

/**
 * Re-run route loaders on an interval while the tab is visible, for
 * near-live dashboards without websockets. Cleared on unmount.
 */
export function useAutoRevalidate(intervalMs = 10_000) {
  const revalidator = useRevalidator();
  const revalidatorRef = useRef(revalidator);
  revalidatorRef.current = revalidator;

  useEffect(() => {
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible" && revalidatorRef.current.state === "idle") {
        void revalidatorRef.current.revalidate();
      }
    }, intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
}

/**
 * The browser origin, SSR-safe: empty string on the server / first paint,
 * then `window.location.origin` after hydration.
 */
export function useOrigin(): string {
  const [origin, setOrigin] = useState("");
  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);
  return origin;
}

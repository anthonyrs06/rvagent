import { useState } from "react";

import type { Zone } from "~/lib/types";

/**
 * Click-to-reveal affordance over a redacted zone. Positioned with the
 * zone's normalized rect so it tracks the page at any zoom/viewport size.
 * The honest label is deliberate: reveals are consent, not stealth.
 */
export function RevealOverlay({
  zone,
  onReveal,
}: {
  zone: Zone;
  onReveal: (zone: Zone) => Promise<boolean>;
}) {
  const [pending, setPending] = useState(false);

  const handleClick = async () => {
    if (pending) return;
    setPending(true);
    const ok = await onReveal(zone);
    // On success the parent unmounts this overlay; on failure re-arm it.
    if (!ok) setPending(false);
  };

  return (
    <button
      type="button"
      onClick={() => void handleClick()}
      disabled={pending}
      style={{
        left: `${zone.x * 100}%`,
        top: `${zone.y * 100}%`,
        width: `${zone.w * 100}%`,
        height: `${zone.h * 100}%`,
      }}
      className="absolute z-10 flex cursor-pointer items-center justify-center overflow-hidden rounded-sm border border-emerald-500/50 bg-gray-950/80 px-1 text-[11px] font-medium whitespace-nowrap text-emerald-300 backdrop-blur-[2px] transition hover:border-emerald-400 hover:bg-gray-900/80 disabled:cursor-wait disabled:opacity-70"
    >
      {pending ? "Revealing…" : "Tap to reveal — this is logged"}
    </button>
  );
}

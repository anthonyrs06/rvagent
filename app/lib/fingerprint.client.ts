/**
 * Coarse device fingerprint for forwarding detection — deliberately NOT a
 * tracking-grade fingerprint. Equality across sessions is all we need to
 * notice one link being opened from many devices.
 */
import type { ClientSignals } from "~/lib/botguard.server";

function djb2Hex(input: string, seed: number): string {
  let h = seed;
  for (let i = 0; i < input.length; i++) {
    h = (h * 33) ^ input.charCodeAt(i);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

export async function computeFingerprint(): Promise<string> {
  const parts = [
    navigator.userAgent,
    navigator.language,
    (navigator.languages ?? []).join(","),
    `${screen.width}x${screen.height}x${screen.colorDepth}`,
    Intl.DateTimeFormat().resolvedOptions().timeZone ?? "",
    String(navigator.hardwareConcurrency ?? 0),
    String(navigator.maxTouchPoints ?? 0),
  ].join("|");

  try {
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(parts));
    return Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  } catch {
    // Non-secure contexts lack crypto.subtle; 16 hex chars still satisfies
    // the server's fingerprint format check.
    return djb2Hex(parts, 5381) + djb2Hex(parts, 52711);
  }
}

/** Bot heuristics inputs sent alongside the gate form. */
export function collectSignals(): ClientSignals {
  return {
    webdriver: Boolean(navigator.webdriver),
    hardwareConcurrency: navigator.hardwareConcurrency ?? 0,
    languages: (navigator.languages ?? []).length,
    plugins: navigator.plugins?.length ?? 0,
    screen: `${screen.width}x${screen.height}`,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone ?? "",
  };
}

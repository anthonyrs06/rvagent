import { useEffect, useRef, useState } from "react";
import { Form, useNavigation } from "react-router";

import { collectSignals, computeFingerprint } from "~/lib/fingerprint.client";
import type { GateActionError, GateData } from "~/lib/viewer-contracts";

const ERROR_COPY: Record<GateActionError, string> = {
  password: "Wrong password — check the exact password you were given.",
  challenge: "We couldn't verify your browser. Reload and try again.",
  blocked: "This browser looks automated, so access was declined.",
  rate_limited: "Too many attempts — wait a minute and try again.",
};

const TURNSTILE_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js";

/** Minimal surface of the Turnstile global we touch; typed locally to avoid global pollution. */
interface TurnstileWindow extends Window {
  turnstile?: {
    render?: (container: HTMLElement, params: Record<string, unknown>) => string | undefined;
    reset?: (widgetId?: string) => void;
  };
}

export function GateScreen({ gate, error }: { gate: GateData; error: GateActionError | null }) {
  const navigation = useNavigation();
  const submitting = navigation.state !== "idle";
  const [fingerprint, setFingerprint] = useState("");
  const [signals, setSignals] = useState("");
  // Recipient-specific copy is client-only so link-preview crawlers never see it in SSR HTML.
  const [hydrated, setHydrated] = useState(false);
  const turnstileRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setHydrated(true);
  }, []);

  // Fingerprint + signals read navigator/screen, so they are client-only.
  useEffect(() => {
    let cancelled = false;
    setSignals(JSON.stringify(collectSignals()));
    void computeFingerprint().then((fp) => {
      if (!cancelled) setFingerprint(fp);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!gate.turnstileSiteKey) return;
    const w = window as TurnstileWindow;
    if (w.turnstile) {
      // Script already loaded (client-side remount): the implicit scan ran
      // long ago, so render into our container explicitly if it's empty.
      const el = turnstileRef.current;
      if (el && el.childElementCount === 0) {
        try {
          w.turnstile.render?.(el, { sitekey: gate.turnstileSiteKey, size: "normal" });
        } catch {
          // Widget render failures surface as a missing token server-side.
        }
      }
      return;
    }
    if (!document.querySelector(`script[src^="${TURNSTILE_SRC}"]`)) {
      const script = document.createElement("script");
      script.src = TURNSTILE_SRC;
      script.async = true;
      script.defer = true;
      document.head.appendChild(script);
    }
  }, [gate.turnstileSiteKey]);

  // Turnstile tokens are single-use; refresh the widget after a rejected submit.
  const previousError = useRef<GateActionError | null>(null);
  useEffect(() => {
    if (gate.turnstileSiteKey && error && error !== previousError.current) {
      try {
        (window as TurnstileWindow).turnstile?.reset?.();
      } catch {
        // A stale widget just means the user reloads, per the error copy.
      }
    }
    previousError.current = error;
  }, [error, gate.turnstileSiteKey]);

  return (
    <main className="flex min-h-svh items-center justify-center bg-gray-950 px-6">
      <div className="w-full max-w-md rounded-2xl border border-gray-800 bg-gray-900 p-8 shadow-2xl">
        <h1 className="text-lg font-semibold text-white">
          You&apos;ve been invited to view a private document
        </h1>
        {hydrated ? (
          <p className="mt-1 text-sm text-gray-400">
            Prepared for <span className="font-medium text-gray-200">{gate.recipientLabel}</span>
          </p>
        ) : (
          <p className="mt-1 text-sm text-gray-400">Enter your credentials to continue.</p>
        )}

        <Form method="post" className="mt-6 space-y-4">
          <input type="hidden" name="fingerprint" value={fingerprint} />
          <input type="hidden" name="signals" value={signals} />

          {gate.needsPassword && (
            <div>
              <label htmlFor="gate-password" className="mb-1 block text-xs font-medium text-gray-400">
                Password
              </label>
              <input
                id="gate-password"
                type="password"
                name="password"
                required
                autoFocus
                autoComplete="off"
                placeholder="Password you were given"
                className="w-full rounded-lg border border-gray-700 bg-gray-950 px-3 py-2 text-sm text-white outline-none focus:border-emerald-500"
              />
            </div>
          )}

          {gate.turnstileSiteKey && (
            <div
              ref={turnstileRef}
              className="cf-turnstile"
              data-sitekey={gate.turnstileSiteKey}
              data-size="normal"
            />
          )}

          <button
            type="submit"
            disabled={!fingerprint || submitting}
            className="w-full rounded-lg bg-emerald-600 py-2 text-sm font-medium text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting ? "Verifying…" : "View document"}
          </button>

          {error && <p className="text-sm text-red-400">{ERROR_COPY[error]}</p>}
        </Form>

        {hydrated && (
          <p className="mt-6 text-xs text-gray-500">
            Views are logged and pages are watermarked for {gate.recipientLabel}.
          </p>
        )}
      </div>
    </main>
  );
}

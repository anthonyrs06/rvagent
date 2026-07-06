import { env } from "~/lib/env.server";
import { turnstileConfigured } from "~/lib/botguard.server";

const MIN_OWNER_PASSWORD_LENGTH = 12;

/**
 * Fail fast in production when required secrets are missing or misconfigured.
 * Called once at server boot from entry.server.tsx.
 */
export function validateProductionEnv(): void {
  if (!env.isProd) return;

  const missing: string[] = [];

  if (!env.ownerPassword || env.ownerPassword.length < MIN_OWNER_PASSWORD_LENGTH) {
    missing.push(
      `OWNER_PASSWORD (required, min ${MIN_OWNER_PASSWORD_LENGTH} characters)`,
    );
  }

  if (!env.posthogToken) missing.push("POSTHOG_TOKEN (phc_ project API key)");
  if (!env.posthogHost) missing.push("POSTHOG_HOST");
  if (!env.posthogPersonalApiKey) missing.push("POSTHOG_PERSONAL_API_KEY (phx_ personal API key)");
  if (!env.posthogProjectId) missing.push("POSTHOG_PROJECT_ID");

  if (missing.length > 0) {
    throw new Error(
      `[boot] Production env validation failed. Set in Render Dashboard:\n  - ${missing.join("\n  - ")}`,
    );
  }

  if (!turnstileConfigured()) {
    console.warn(
      "[boot] TURNSTILE_SITE_KEY / TURNSTILE_SECRET_KEY not set — gate runs without bot challenge (Phase 1 OK).",
    );
  }
}

// Run validation at module load (server boot).
validateProductionEnv();

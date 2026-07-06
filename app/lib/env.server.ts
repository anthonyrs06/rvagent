import { randomBytes } from "node:crypto";

const isProd = process.env.NODE_ENV === "production";

/**
 * Required secrets fail hard in production; in dev they fall back to an
 * ephemeral per-process value with a loud warning (cookies won't survive
 * restarts until you set them in .env).
 */
function requiredSecret(name: string): string {
  const v = process.env[name];
  if (v) return v;
  if (isProd) throw new Error(`Missing required env var: ${name}`);
  const generated = randomBytes(32).toString("hex");
  process.env[name] = generated;
  console.warn(`[env] ${name} is not set — generated an ephemeral dev value. Set it in .env.`);
  return generated;
}

export const env = {
  /** Root for the SQLite db and file storage. */
  dataDir: process.env.DATA_DIR ?? "./data",
  /** Signs viewer + admin session cookies. */
  sessionSecret: requiredSecret("SESSION_SECRET"),
  /** Salts IP/UA hashes so raw values are never stored. */
  ipHashSalt: process.env.IP_HASH_SALT ?? requiredSecret("SESSION_SECRET"),
  /** Single-owner admin password (argon2-verified at login). */
  ownerPassword: process.env.OWNER_PASSWORD ?? "",

  // Optional integrations — features degrade gracefully when unset.
  slackWebhookUrl: process.env.SLACK_WEBHOOK_URL ?? "",
  turnstileSiteKey: process.env.TURNSTILE_SITE_KEY ?? "",
  turnstileSecretKey: process.env.TURNSTILE_SECRET_KEY ?? "",
  posthogPersonalApiKey: process.env.POSTHOG_PERSONAL_API_KEY ?? "",
  posthogProjectId: process.env.POSTHOG_PROJECT_ID ?? "",
  /** Server-side PostHog capture (mirrors client events past ad blockers). */
  posthogToken: process.env.POSTHOG_TOKEN ?? process.env.VITE_PUBLIC_POSTHOG_TOKEN ?? "",
  posthogHost: process.env.POSTHOG_HOST ?? process.env.VITE_PUBLIC_POSTHOG_HOST ?? "https://us.i.posthog.com",

  isProd,
};

import { isbot } from "isbot";

import { env } from "~/lib/env.server";

/** Signals collected by the gate page in the viewer's browser. */
export interface ClientSignals {
  webdriver?: boolean;
  hardwareConcurrency?: number;
  languages?: number;
  plugins?: number;
  screen?: string;
  timezone?: string;
}

export interface BotAssessment {
  /** Any signal fired — drives the dashboard "suspected bot" badge (telemetry). */
  suspected: boolean;
  /** Proof-level automation — deny access. Kept deliberately narrow. */
  hardBlock: boolean;
  reasons: string[];
}

/**
 * Tokens no human browser ever sends — safe to hard-block. Deliberately does
 * NOT include a bare `isbot()` match: isbot flags Electron/embedded browsers
 * (Cursor's preview, desktop in-app browsers, some webviews) that are real
 * humans. Those stay a soft/telemetry signal, and real content is protected
 * behind the JS gate + session cookie regardless.
 */
const AUTOMATION_UA =
  /(headless|phantomjs|slimerjs|selenium|puppeteer|playwright|python-requests|\bcurl\/|\bwget\/|scrapy|httpclient|go-http-client|okhttp|java\/|libwww|axios\/|node-fetch)/i;

export function assessRequest(request: Request): BotAssessment {
  const ua = request.headers.get("user-agent") ?? "";
  const reasons: string[] = [];
  let hardBlock = false;
  if (!ua) {
    reasons.push("missing_user_agent");
  } else if (AUTOMATION_UA.test(ua)) {
    reasons.push("automation_ua");
    hardBlock = true;
  } else if (isbot(ua)) {
    // Crawler heuristic OR a legitimate embedded/Electron browser — telemetry
    // only, never a hard block.
    reasons.push("isbot_match");
  }
  if (!request.headers.get("accept-language")) reasons.push("missing_accept_language");
  return { suspected: reasons.length > 0, hardBlock, reasons };
}

export function assessClientSignals(signals: ClientSignals | null): BotAssessment {
  // Reaching the gate submit without JS-collected signals means a scripted
  // POST bypassed the form (the gate button is disabled until signals exist).
  if (!signals) {
    return { suspected: true, hardBlock: true, reasons: ["no_client_signals"] };
  }
  const reasons: string[] = [];
  let hardBlock = false;
  if (signals.webdriver) {
    reasons.push("webdriver_true");
    hardBlock = true;
  }
  if ((signals.languages ?? 0) === 0) reasons.push("no_languages");
  if ((signals.hardwareConcurrency ?? 0) === 0) reasons.push("no_cores");
  return { suspected: reasons.length > 0, hardBlock, reasons };
}

export function turnstileConfigured(): boolean {
  return Boolean(env.turnstileSiteKey && env.turnstileSecretKey);
}

/**
 * Verify a Turnstile challenge token. Returns true when Turnstile is not
 * configured so local setups work with zero external accounts.
 */
export async function verifyTurnstile(token: string | null, ip: string): Promise<boolean> {
  if (!turnstileConfigured()) return true;
  if (!token) return false;
  try {
    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        secret: env.turnstileSecretKey,
        response: token,
        remoteip: ip === "local" ? undefined : ip,
      }),
      signal: AbortSignal.timeout(8000),
    });
    const data = (await res.json()) as { success?: boolean };
    return data.success === true;
  } catch (error) {
    console.warn("[botguard] Turnstile verify failed:", error);
    // Fail closed: if the verifier is unreachable, do not admit the viewer.
    return false;
  }
}

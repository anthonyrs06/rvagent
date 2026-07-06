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
  suspected: boolean;
  reasons: string[];
}

const SUSPICIOUS_UA = /(headless|phantom|selenium|puppeteer|playwright|python-requests|curl\/|wget\/|scrapy|httpclient)/i;

export function assessRequest(request: Request): BotAssessment {
  const ua = request.headers.get("user-agent") ?? "";
  const reasons: string[] = [];
  if (!ua) reasons.push("missing_user_agent");
  else {
    if (isbot(ua)) reasons.push("isbot_match");
    if (SUSPICIOUS_UA.test(ua)) reasons.push("suspicious_ua");
  }
  if (!request.headers.get("accept-language")) reasons.push("missing_accept_language");
  return { suspected: reasons.length > 0, reasons };
}

export function assessClientSignals(signals: ClientSignals | null): BotAssessment {
  const reasons: string[] = [];
  if (!signals) {
    return { suspected: true, reasons: ["no_client_signals"] };
  }
  if (signals.webdriver) reasons.push("webdriver_true");
  if ((signals.languages ?? 0) === 0) reasons.push("no_languages");
  if ((signals.hardwareConcurrency ?? 0) === 0) reasons.push("no_cores");
  return { suspected: reasons.length > 0, reasons };
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

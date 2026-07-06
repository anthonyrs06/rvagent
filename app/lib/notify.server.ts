import { env } from "~/lib/env.server";

/**
 * Fire-and-forget Slack notifications. Never throws, never blocks a response;
 * if SLACK_WEBHOOK_URL is unset this is a no-op.
 */
export function notifySlack(text: string): void {
  if (!env.slackWebhookUrl) return;
  void fetch(env.slackWebhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
    signal: AbortSignal.timeout(5000),
  }).catch((error) => {
    console.warn("[notify] Slack webhook failed:", error instanceof Error ? error.message : error);
  });
}

export function notifyFirstOpen(recipientLabel: string, resumeLabel: string, deviceLabel: string | null): void {
  notifySlack(
    `:eyes: *Your resume was just opened*\n` +
      `Link: *${recipientLabel}* · Resume: ${resumeLabel}` +
      (deviceLabel ? ` · ${deviceLabel}` : ""),
  );
}

export function notifySessionStart(recipientLabel: string, resumeLabel: string, deviceLabel: string | null): void {
  notifySlack(
    `:small_blue_diamond: New viewing session on *${recipientLabel}* (${resumeLabel})` +
      (deviceLabel ? ` · ${deviceLabel}` : ""),
  );
}

export function notifyReveal(recipientLabel: string, zoneLabel: string): void {
  notifySlack(`:unlock: *${recipientLabel}* revealed the redacted "${zoneLabel}" zone.`);
}

export function notifySecurity(type: string, recipientLabel: string, detail?: string): void {
  notifySlack(
    `:rotating_light: *Security event* \`${type}\` on link *${recipientLabel}*` +
      (detail ? `\n${detail}` : ""),
  );
}

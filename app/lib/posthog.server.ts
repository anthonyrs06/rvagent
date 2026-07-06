/**
 * Server-side PostHog:
 *  1. Mirror capture of authoritative events (opens, gate outcomes) so viewer
 *     ad-blockers can't blind analytics.
 *  2. HogQL queries for dashboard aggregates.
 * Both are no-ops when unconfigured — the app never depends on PostHog.
 */
import { PostHog } from "posthog-node";

import { env } from "~/lib/env.server";

declare global {
  // eslint-disable-next-line no-var
  var __rvPosthog: PostHog | null | undefined;
}

function getClient(): PostHog | null {
  if (globalThis.__rvPosthog !== undefined) return globalThis.__rvPosthog;
  if (!env.posthogToken) {
    globalThis.__rvPosthog = null;
    return null;
  }
  globalThis.__rvPosthog = new PostHog(env.posthogToken, {
    host: env.posthogHost,
    flushAt: 5,
    flushInterval: 5000,
  });
  return globalThis.__rvPosthog;
}

/**
 * Server-authoritative capture. Callers pass a stable non-PII distinct id
 * ("viewer:<sessionId>" or "link:<linkId>") — viewers are anonymous-but-
 * consistent, never identified with real PII.
 */
export function captureServer(
  distinctId: string,
  event: string,
  properties?: Record<string, unknown>,
): void {
  const client = getClient();
  if (!client) return;
  client.capture({
    distinctId,
    event,
    properties: { source: "server", ...properties },
  });
}

export function isPostHogQueryConfigured(): boolean {
  return Boolean(env.posthogPersonalApiKey && env.posthogProjectId);
}

export interface HogQLResult {
  columns: string[];
  results: unknown[][];
}

const POSTHOG_APP_HOST = "https://us.posthog.com";

export async function queryPostHog(hogql: string): Promise<HogQLResult> {
  if (!isPostHogQueryConfigured()) {
    throw new Error("PostHog personal API key / project id not configured");
  }
  const response = await fetch(
    `${POSTHOG_APP_HOST}/api/projects/${env.posthogProjectId}/query/`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.posthogPersonalApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query: { kind: "HogQLQuery", query: hogql } }),
      signal: AbortSignal.timeout(10_000),
    },
  );
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    console.error("[posthog] query failed", response.status, body.slice(0, 300));
    throw new Error(`PostHog query failed: ${response.status}`);
  }
  const json = (await response.json()) as HogQLResult;
  return { columns: json.columns ?? [], results: json.results ?? [] };
}

/**
 * Daily `resume_opened` counts for the last 30 days, from PostHog when
 * configured. Callers fall back to first-party data on null.
 */
export async function posthogOpensByDay(): Promise<Array<{ day: string; opens: number }> | null> {
  if (!isPostHogQueryConfigured()) return null;
  try {
    const { results } = await queryPostHog(
      `select toDate(timestamp) as day, count() as opens
       from events
       where event = 'resume_opened' and timestamp >= now() - interval 30 day
       group by day order by day asc`,
    );
    return results.map((row) => ({ day: String(row[0]), opens: Number(row[1]) }));
  } catch {
    return null;
  }
}

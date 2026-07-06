import { and, countDistinct, eq, gte, ne } from "drizzle-orm";
import { createCookie } from "react-router";

import { db, schema } from "~/db/index.server";
import { env } from "~/lib/env.server";
import { newId, saltedHash } from "~/lib/ids.server";
import { incrementOpenCount, setLinkStatus } from "~/lib/links.server";
import { notifyFirstOpen, notifySecurity, notifySessionStart } from "~/lib/notify.server";
import { captureServer } from "~/lib/posthog.server";
import type { LinkRow, SessionRow } from "~/db/schema";

const { sessions, securityEvents } = schema;

/** Distinct devices allowed per link in the forwarding window before we flag. */
const FORWARD_DEVICE_THRESHOLD = 3;
const FORWARD_WINDOW_MS = 48 * 60 * 60 * 1000;

const viewerCookie = createCookie("rv_viewer", {
  httpOnly: true,
  sameSite: "lax",
  path: "/",
  secure: env.isProd,
  secrets: [env.sessionSecret],
  maxAge: 60 * 60 * 12,
});

interface ViewerCookiePayload {
  sessionId: string;
  linkId: string;
}

export async function serializeViewerCookie(payload: ViewerCookiePayload): Promise<string> {
  return viewerCookie.serialize(payload);
}

async function parseViewerCookie(request: Request): Promise<ViewerCookiePayload | null> {
  const parsed = await viewerCookie.parse(request.headers.get("Cookie")).catch(() => null);
  if (parsed && typeof parsed.sessionId === "string" && typeof parsed.linkId === "string") {
    return parsed as ViewerCookiePayload;
  }
  return null;
}

export interface DeviceInfo {
  fingerprint: string;
  deviceLabel: string | null;
  suspectedBot: boolean;
}

function summarizeDevice(ua: string): string | null {
  if (!ua) return null;
  const browser = /edg\//i.test(ua)
    ? "Edge"
    : /chrome\//i.test(ua)
      ? "Chrome"
      : /safari\//i.test(ua) && /version\//i.test(ua)
        ? "Safari"
        : /firefox\//i.test(ua)
          ? "Firefox"
          : "Browser";
  const os = /iphone|ipad/i.test(ua)
    ? "iOS"
    : /android/i.test(ua)
      ? "Android"
      : /mac os x/i.test(ua)
        ? "macOS"
        : /windows/i.test(ua)
          ? "Windows"
          : /linux/i.test(ua)
            ? "Linux"
            : "Unknown OS";
  return `${browser} · ${os}`;
}

export interface StartSessionResult {
  session: SessionRow;
  cookieHeader: string;
  forwardSuspected: boolean;
}

/**
 * Create a viewing session after all gates pass: bumps the link open count,
 * runs forwarding detection, fires notifications, and issues the signed
 * httpOnly cookie that authorizes tile/event requests.
 */
export async function startSession(
  request: Request,
  link: LinkRow,
  resumeLabel: string,
  device: { fingerprint: string; suspectedBot: boolean },
): Promise<StartSessionResult> {
  const ua = request.headers.get("user-agent") ?? "";
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";

  const [session] = await db
    .insert(sessions)
    .values({
      id: newId(),
      linkId: link.id,
      ipHash: saltedHash(ip),
      uaHash: saltedHash(ua),
      fingerprint: device.fingerprint,
      deviceLabel: summarizeDevice(ua),
      suspectedBot: device.suspectedBot,
    })
    .returning();

  const { firstOpen } = await incrementOpenCount(link.id);
  if (firstOpen) {
    notifyFirstOpen(link.recipientLabel, resumeLabel, session.deviceLabel);
  } else {
    notifySessionStart(link.recipientLabel, resumeLabel, session.deviceLabel);
  }

  // Server-side mirror: survives viewer ad-blockers.
  captureServer(`viewer:${session.id}`, "resume_opened", {
    link_id: link.id,
    resume_label: resumeLabel,
    first_open: firstOpen,
    device: session.deviceLabel,
    suspected_bot: device.suspectedBot,
  });

  const forwardSuspected = await detectForwarding(link, session);

  const cookieHeader = await serializeViewerCookie({ sessionId: session.id, linkId: link.id });
  return { session, cookieHeader, forwardSuspected };
}

/**
 * Forwarding heuristic: N+ distinct device fingerprints on one link within
 * the window means the URL is probably being passed around. Optionally
 * auto-locks the link (owner opt-in per link).
 */
async function detectForwarding(link: LinkRow, current: SessionRow): Promise<boolean> {
  const windowStart = new Date(Date.now() - FORWARD_WINDOW_MS);
  const [row] = await db
    .select({ devices: countDistinct(sessions.fingerprint) })
    .from(sessions)
    .where(and(eq(sessions.linkId, link.id), gte(sessions.startedAt, windowStart)));
  const devices = row?.devices ?? 1;
  if (devices < FORWARD_DEVICE_THRESHOLD) return false;

  // Only alert once per extra device: check if we already logged for this count.
  const [existing] = await db
    .select({ id: securityEvents.id })
    .from(securityEvents)
    .where(
      and(
        eq(securityEvents.linkId, link.id),
        eq(securityEvents.type, "forward_suspected"),
        ne(securityEvents.sessionId, current.id),
      ),
    )
    .limit(1);

  await db.insert(securityEvents).values({
    id: newId(),
    sessionId: current.id,
    linkId: link.id,
    type: "forward_suspected",
    meta: { distinctDevices: devices, windowHours: FORWARD_WINDOW_MS / 3_600_000 },
  });

  if (!existing) {
    notifySecurity(
      "forward_suspected",
      link.recipientLabel,
      `${devices} distinct devices opened this link in the last 48h.`,
    );
  }

  if (link.autoLockOnForward && link.status === "active") {
    await setLinkStatus(link.id, "locked");
    await db.insert(securityEvents).values({
      id: newId(),
      sessionId: current.id,
      linkId: link.id,
      type: "auto_locked",
      meta: { distinctDevices: devices },
    });
    notifySecurity("auto_locked", link.recipientLabel, "Link was automatically locked.");
  }
  return true;
}

export interface AuthorizedSession {
  session: SessionRow;
  link: LinkRow;
}

/**
 * Authorize a tile/event/reveal request: valid signed cookie, session exists,
 * session belongs to a link that is still viewable, and the cookie's linkId
 * matches. Returns null rather than throwing so callers control the response.
 */
export async function getAuthorizedSession(request: Request): Promise<AuthorizedSession | null> {
  const payload = await parseViewerCookie(request);
  if (!payload) return null;

  const [row] = await db
    .select({ session: sessions, link: schema.links })
    .from(sessions)
    .innerJoin(schema.links, eq(sessions.linkId, schema.links.id))
    .where(eq(sessions.id, payload.sessionId))
    .limit(1);
  if (!row) return null;
  if (row.link.id !== payload.linkId) return null;
  if (row.link.status !== "active") return null;
  if (row.link.expiresAt && row.link.expiresAt.getTime() < Date.now()) return null;
  return row;
}

export async function touchSession(sessionId: string): Promise<void> {
  await db.update(sessions).set({ lastSeenAt: new Date() }).where(eq(sessions.id, sessionId));
}

export async function endSession(sessionId: string): Promise<void> {
  await db
    .update(sessions)
    .set({ endedAt: new Date(), lastSeenAt: new Date() })
    .where(eq(sessions.id, sessionId));
}

export async function addRevealedZone(sessionRow: SessionRow, zoneId: string): Promise<string[]> {
  const revealed = sessionRow.revealedZones.includes(zoneId)
    ? sessionRow.revealedZones
    : [...sessionRow.revealedZones, zoneId];
  await db.update(sessions).set({ revealedZones: revealed }).where(eq(sessions.id, sessionRow.id));
  return revealed;
}

export async function getSessionsForLink(linkId: string) {
  return db.select().from(sessions).where(eq(sessions.linkId, linkId)).orderBy(sessions.startedAt);
}

export async function hasPriorSessionFromDevice(
  linkId: string,
  fingerprint: string,
  beforeSessionId: string,
): Promise<boolean> {
  const [row] = await db
    .select({ id: sessions.id })
    .from(sessions)
    .where(
      and(
        eq(sessions.linkId, linkId),
        eq(sessions.fingerprint, fingerprint),
        ne(sessions.id, beforeSessionId),
      ),
    )
    .limit(1);
  return Boolean(row);
}

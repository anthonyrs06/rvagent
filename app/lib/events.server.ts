import { and, asc, eq } from "drizzle-orm";

import { db, schema } from "~/db/index.server";
import { newId } from "~/lib/ids.server";
import { notifySecurity } from "~/lib/notify.server";
import { computeEngagementScore } from "~/lib/scoring";
import { hasPriorSessionFromDevice } from "~/lib/sessions.server";
import { SECURITY_EVENT_TYPES, type ClientEvent, type Zone } from "~/lib/types";
import type { LinkRow, SessionRow } from "~/db/schema";

const { events, securityEvents, sessions } = schema;

const MAX_BATCH = 50;
/** Security event types worth a Slack ping (the rest are logged only). */
const NOTIFY_SECURITY: ReadonlySet<string> = new Set(["print_attempt", "devtools_open", "screenshot_key"]);

function sanitizeMeta(meta: unknown): Record<string, unknown> | null {
  if (!meta || typeof meta !== "object") return null;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(meta as Record<string, unknown>).slice(0, 10)) {
    if (typeof v === "string") out[k] = v.slice(0, 200);
    else if (typeof v === "number" || typeof v === "boolean") out[k] = v;
  }
  return Object.keys(out).length ? out : null;
}

/**
 * Persist a batch of client-reported events for an authorized session.
 * Client timestamps are untrusted — we store server receive time and keep the
 * client `at` only inside meta for ordering within a batch.
 */
export async function ingestClientEvents(
  session: SessionRow,
  link: LinkRow,
  rawEvents: unknown,
): Promise<{ accepted: number }> {
  if (!Array.isArray(rawEvents)) return { accepted: 0 };
  const batch = rawEvents.slice(0, MAX_BATCH);
  let accepted = 0;

  for (const raw of batch) {
    if (!raw || typeof raw !== "object") continue;
    const e = raw as Partial<ClientEvent>;
    if (typeof e.type !== "string" || e.type.length > 40) continue;

    const isSecurity = SECURITY_EVENT_TYPES.has(e.type);
    const pageIndex = typeof e.pageIndex === "number" && e.pageIndex >= 0 ? Math.floor(e.pageIndex) : null;
    const zoneId = typeof e.zoneId === "string" ? e.zoneId.slice(0, 64) : null;
    const value = typeof e.value === "number" && Number.isFinite(e.value) ? e.value : null;
    const meta = sanitizeMeta(e.meta);

    if (isSecurity) {
      await db.insert(securityEvents).values({
        id: newId(),
        sessionId: session.id,
        linkId: link.id,
        type: e.type,
        meta,
      });
      if (NOTIFY_SECURITY.has(e.type)) {
        notifySecurity(e.type, link.recipientLabel);
      }
    } else {
      await db.insert(events).values({
        id: newId(),
        sessionId: session.id,
        linkId: link.id,
        type: e.type,
        pageIndex,
        zoneId,
        value,
        meta,
      });
    }
    accepted++;
  }

  return { accepted };
}

export async function logServerEvent(
  sessionId: string | null,
  linkId: string | null,
  type: string,
  meta?: Record<string, unknown>,
): Promise<void> {
  await db.insert(securityEvents).values({
    id: newId(),
    sessionId,
    linkId,
    type,
    meta: meta ?? null,
  });
}

export async function getEventsForSession(sessionId: string) {
  return db.select().from(events).where(eq(events.sessionId, sessionId)).orderBy(asc(events.createdAt));
}

export async function getSecurityEventsForLink(linkId: string) {
  return db
    .select()
    .from(securityEvents)
    .where(eq(securityEvents.linkId, linkId))
    .orderBy(asc(securityEvents.createdAt));
}

export interface SessionAnalytics {
  activeMs: number;
  pagesSeen: number[];
  /** zoneId -> dwell ms, for kind === "section" zones. */
  sectionDwellMs: Record<string, number>;
  reveals: number;
  zooms: number;
  score: number;
}

/**
 * Fold a session's event stream into the analytics summary used by the
 * dashboard, and compute/persist its engagement score.
 */
export async function summarizeSession(
  session: SessionRow,
  link: LinkRow,
  pageCount: number,
  zones: Zone[],
): Promise<SessionAnalytics> {
  const rows = await getEventsForSession(session.id);

  let activeMs = 0;
  const pagesSeen = new Set<number>();
  const sectionDwellMs: Record<string, number> = {};
  let reveals = 0;
  let zooms = 0;

  for (const row of rows) {
    switch (row.type) {
      case "page_dwell":
        activeMs += row.value ?? 0;
        if (row.pageIndex !== null) pagesSeen.add(row.pageIndex);
        break;
      case "page_view":
        if (row.pageIndex !== null) pagesSeen.add(row.pageIndex);
        break;
      case "section_dwell":
        if (row.zoneId) {
          sectionDwellMs[row.zoneId] = (sectionDwellMs[row.zoneId] ?? 0) + (row.value ?? 0);
        }
        break;
      case "reveal_click":
        reveals++;
        break;
      case "zoom":
        zooms++;
        break;
    }
  }

  const sectionZones = zones.filter((z) => z.kind === "section");
  const dwelledSections = sectionZones.filter((z) => (sectionDwellMs[z.id] ?? 0) >= 1000).length;

  const returnVisit = await hasPriorSessionFromDevice(link.id, session.fingerprint, session.id);

  const score = computeEngagementScore({
    activeMs,
    completion: pageCount > 0 ? pagesSeen.size / pageCount : 0,
    sectionCoverage: sectionZones.length > 0 ? dwelledSections / sectionZones.length : 1,
    reveals,
    returnVisit,
  });

  if (session.engagementScore !== score) {
    await db.update(sessions).set({ engagementScore: score }).where(eq(sessions.id, session.id));
  }

  return { activeMs, pagesSeen: [...pagesSeen].sort((a, b) => a - b), sectionDwellMs, reveals, zooms, score };
}

/** Aggregate section dwell across all sessions of a link (attention map). */
export async function aggregateSectionDwell(linkId: string): Promise<Record<string, number>> {
  const rows = await db
    .select()
    .from(events)
    .where(and(eq(events.linkId, linkId), eq(events.type, "section_dwell")));
  const out: Record<string, number> = {};
  for (const row of rows) {
    if (row.zoneId) out[row.zoneId] = (out[row.zoneId] ?? 0) + (row.value ?? 0);
  }
  return out;
}

/** Aggregate page dwell across all sessions of a link (drop-off analysis). */
export async function aggregatePageDwell(linkId: string): Promise<Record<number, number>> {
  const rows = await db
    .select()
    .from(events)
    .where(and(eq(events.linkId, linkId), eq(events.type, "page_dwell")));
  const out: Record<number, number> = {};
  for (const row of rows) {
    if (row.pageIndex !== null) out[row.pageIndex] = (out[row.pageIndex] ?? 0) + (row.value ?? 0);
  }
  return out;
}

import { and, desc, eq, gte, isNull, sql } from "drizzle-orm";

import { db, schema } from "~/db/index.server";
import { posthogOpensByDay } from "~/lib/posthog.server";

const { links, resumes, sessions, securityEvents } = schema;

export interface DashboardStats {
  resumeCount: number;
  activeLinkCount: number;
  sessionsToday: number;
  liveNow: number;
}

export async function getDashboardStats(): Promise<DashboardStats> {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const liveCutoff = new Date(Date.now() - 30_000);

  const [resumeCount] = await db.select({ n: sql<number>`count(*)` }).from(resumes);
  const [activeLinkCount] = await db
    .select({ n: sql<number>`count(*)` })
    .from(links)
    .where(eq(links.status, "active"));
  const [sessionsToday] = await db
    .select({ n: sql<number>`count(*)` })
    .from(sessions)
    .where(gte(sessions.startedAt, startOfDay));
  const [liveNow] = await db
    .select({ n: sql<number>`count(*)` })
    .from(sessions)
    .where(and(gte(sessions.lastSeenAt, liveCutoff), isNull(sessions.endedAt)));

  return {
    resumeCount: resumeCount?.n ?? 0,
    activeLinkCount: activeLinkCount?.n ?? 0,
    sessionsToday: sessionsToday?.n ?? 0,
    liveNow: liveNow?.n ?? 0,
  };
}

export interface RecentSession {
  sessionId: string;
  linkId: string;
  recipientLabel: string;
  resumeLabel: string;
  startedAt: Date;
  lastSeenAt: Date;
  endedAt: Date | null;
  deviceLabel: string | null;
  engagementScore: number | null;
  suspectedBot: boolean;
  live: boolean;
}

export async function getRecentSessions(limit = 12): Promise<RecentSession[]> {
  const liveCutoff = Date.now() - 30_000;
  const rows = await db
    .select({ session: sessions, link: links, resumeLabel: resumes.label })
    .from(sessions)
    .innerJoin(links, eq(sessions.linkId, links.id))
    .innerJoin(resumes, eq(links.resumeId, resumes.id))
    .orderBy(desc(sessions.startedAt))
    .limit(limit);
  return rows.map(({ session, link, resumeLabel }) => ({
    sessionId: session.id,
    linkId: link.id,
    recipientLabel: link.recipientLabel,
    resumeLabel,
    startedAt: session.startedAt,
    lastSeenAt: session.lastSeenAt,
    endedAt: session.endedAt,
    deviceLabel: session.deviceLabel,
    engagementScore: session.engagementScore,
    suspectedBot: session.suspectedBot,
    live: !session.endedAt && session.lastSeenAt.getTime() >= liveCutoff,
  }));
}

export interface RecentSecurityEvent {
  id: string;
  type: string;
  recipientLabel: string | null;
  createdAt: Date;
  meta: Record<string, unknown> | null;
}

export async function getRecentSecurityEvents(limit = 10): Promise<RecentSecurityEvent[]> {
  const rows = await db
    .select({ event: securityEvents, recipientLabel: links.recipientLabel })
    .from(securityEvents)
    .leftJoin(links, eq(securityEvents.linkId, links.id))
    .orderBy(desc(securityEvents.createdAt))
    .limit(limit);
  return rows.map(({ event, recipientLabel }) => ({
    id: event.id,
    type: event.type,
    recipientLabel,
    createdAt: event.createdAt,
    meta: event.meta,
  }));
}

export interface OpensSeriesPoint {
  day: string;
  opens: number;
}

/** 30-day opens series: PostHog (HogQL) when configured, else first-party. */
export async function getOpensSeries(): Promise<{ source: "posthog" | "first-party"; points: OpensSeriesPoint[] }> {
  const fromPosthog = await posthogOpensByDay();
  if (fromPosthog) return { source: "posthog", points: fromPosthog };

  const since = new Date();
  since.setHours(0, 0, 0, 0);
  since.setDate(since.getDate() - 29);

  const rows = await db
    .select({
      day: sql<string>`date(${sessions.startedAt} / 1000, 'unixepoch')`,
      opens: sql<number>`count(*)`,
    })
    .from(sessions)
    .where(gte(sessions.startedAt, since))
    .groupBy(sql`date(${sessions.startedAt} / 1000, 'unixepoch')`)
    .orderBy(sql`date(${sessions.startedAt} / 1000, 'unixepoch')`);

  const byDay = new Map(rows.map((r) => [r.day, r.opens]));
  const points: OpensSeriesPoint[] = [];
  for (let i = 0; i < 30; i++) {
    const d = new Date(since);
    d.setDate(since.getDate() + i);
    const key = d.toISOString().slice(0, 10);
    points.push({ day: key, opens: byDay.get(key) ?? 0 });
  }
  return { source: "first-party", points };
}

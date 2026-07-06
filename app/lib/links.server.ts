import { hash, verify } from "@node-rs/argon2";
import { and, desc, eq, sql } from "drizzle-orm";

import { db, schema } from "~/db/index.server";
import { newId, newToken } from "~/lib/ids.server";
import type { LinkRow, ResumeRow } from "~/db/schema";

const { links, resumes, sessions } = schema;

export interface CreateLinkInput {
  resumeId: string;
  recipientLabel: string;
  note?: string;
  /** null = never expires */
  ttlMs: number | null;
  password?: string;
  maxViews?: number | null;
  oneTime?: boolean;
  redacted?: boolean;
  autoLockOnForward?: boolean;
}

export async function createLink(input: CreateLinkInput): Promise<LinkRow> {
  const [row] = await db
    .insert(links)
    .values({
      id: newId(),
      token: newToken(),
      resumeId: input.resumeId,
      recipientLabel: input.recipientLabel.trim(),
      note: input.note?.trim() || null,
      expiresAt: input.ttlMs === null ? null : new Date(Date.now() + input.ttlMs),
      passwordHash: input.password ? await hash(input.password) : null,
      maxViews: input.maxViews ?? null,
      oneTime: input.oneTime ?? false,
      redacted: input.redacted ?? false,
      autoLockOnForward: input.autoLockOnForward ?? false,
    })
    .returning();
  return row;
}

export type LinkValidation =
  | { ok: true; link: LinkRow; resume: ResumeRow }
  | { ok: false; reason: "not_found" | "expired" | "revoked" | "paused" | "locked" | "exhausted" | "not_ready" };

/** True when one-time/max-view budgets forbid creating another session. */
export function linkBudgetExhausted(link: LinkRow): boolean {
  if (link.oneTime && link.openCount >= 1) return true;
  return link.maxViews !== null && link.openCount >= link.maxViews;
}

/**
 * Decide whether a share token may start (or continue) a viewing session.
 * `forNewSession` additionally enforces one-time + max-view budgets, which
 * only apply when a brand-new session would be created.
 */
export async function validateLink(token: string, opts: { forNewSession: boolean }): Promise<LinkValidation> {
  const [row] = await db
    .select({ link: links, resume: resumes })
    .from(links)
    .innerJoin(resumes, eq(links.resumeId, resumes.id))
    .where(eq(links.token, token))
    .limit(1);
  if (!row) return { ok: false, reason: "not_found" };

  const { link, resume } = row;
  if (link.status === "revoked") return { ok: false, reason: "revoked" };
  if (link.status === "paused") return { ok: false, reason: "paused" };
  if (link.status === "locked") return { ok: false, reason: "locked" };
  if (link.expiresAt && link.expiresAt.getTime() < Date.now()) return { ok: false, reason: "expired" };
  if (resume.status !== "ready") return { ok: false, reason: "not_ready" };

  if (opts.forNewSession && linkBudgetExhausted(link)) {
    return { ok: false, reason: "exhausted" };
  }
  return { ok: true, link, resume };
}

export async function verifyLinkPassword(link: LinkRow, password: string): Promise<boolean> {
  if (!link.passwordHash) return true;
  if (!password) return false;
  try {
    return await verify(link.passwordHash, password);
  } catch {
    return false;
  }
}

export async function setLinkStatus(id: string, status: LinkRow["status"]) {
  await db.update(links).set({ status, updatedAt: new Date() }).where(eq(links.id, id));
}

export async function getLink(id: string) {
  const [row] = await db.select().from(links).where(eq(links.id, id)).limit(1);
  return row ?? null;
}

export async function getLinkByToken(token: string) {
  const [row] = await db.select().from(links).where(eq(links.token, token)).limit(1);
  return row ?? null;
}

/** Links with lightweight stats for the admin list view. */
export async function listLinksWithStats() {
  const liveCutoff = new Date(Date.now() - 30_000);
  return db
    .select({
      link: links,
      resumeLabel: resumes.label,
      sessionCount: sql<number>`(select count(*) from ${sessions} where ${sessions.linkId} = ${links.id})`,
      lastSeenAt: sql<number | null>`(select max(${sessions.lastSeenAt}) from ${sessions} where ${sessions.linkId} = ${links.id})`,
      liveCount: sql<number>`(select count(*) from ${sessions} where ${sessions.linkId} = ${links.id} and ${sessions.lastSeenAt} >= ${liveCutoff.getTime()} and ${sessions.endedAt} is null)`,
    })
    .from(links)
    .innerJoin(resumes, eq(links.resumeId, resumes.id))
    .orderBy(desc(links.createdAt));
}

export async function incrementOpenCount(linkId: string): Promise<{ firstOpen: boolean }> {
  const [before] = await db.select().from(links).where(eq(links.id, linkId)).limit(1);
  const firstOpen = !before?.firstOpenedAt;
  await db
    .update(links)
    .set({
      openCount: sql`${links.openCount} + 1`,
      firstOpenedAt: firstOpen ? new Date() : undefined,
      updatedAt: new Date(),
    })
    .where(eq(links.id, linkId));
  return { firstOpen };
}

export async function deleteLink(id: string) {
  await db.delete(links).where(and(eq(links.id, id)));
}

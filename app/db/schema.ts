import { index, integer, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

import type { Zone } from "~/lib/types";

const now = () => new Date();

export const resumes = sqliteTable("resumes", {
  id: text("id").primaryKey(),
  /** Version label, e.g. "General 2026" or "Acme — Staff Eng". */
  label: text("label").notNull(),
  /** Storage key of the original PDF. Never served to viewers. */
  originalKey: text("original_key").notNull(),
  pageCount: integer("page_count").notNull().default(0),
  status: text("status").$type<"processing" | "ready" | "failed">().notNull().default("processing"),
  error: text("error"),
  /** Redaction boxes + named analytics sections, normalized page coords. */
  zones: text("zones", { mode: "json" }).$type<Zone[]>().notNull().$defaultFn(() => []),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().$defaultFn(now),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull().$defaultFn(now),
});

export const resumePages = sqliteTable(
  "resume_pages",
  {
    id: text("id").primaryKey(),
    resumeId: text("resume_id")
      .notNull()
      .references(() => resumes.id, { onDelete: "cascade" }),
    pageIndex: integer("page_index").notNull(),
    /** Storage keys per zoom tier (WebP). */
    loKey: text("lo_key").notNull(),
    hiKey: text("hi_key").notNull(),
    loWidth: integer("lo_width").notNull(),
    loHeight: integer("lo_height").notNull(),
    hiWidth: integer("hi_width").notNull(),
    hiHeight: integer("hi_height").notNull(),
  },
  (t) => [uniqueIndex("resume_pages_resume_page_idx").on(t.resumeId, t.pageIndex)],
);

export const links = sqliteTable(
  "links",
  {
    id: text("id").primaryKey(),
    /** Unguessable 128-bit base64url share token. */
    token: text("token").notNull(),
    resumeId: text("resume_id")
      .notNull()
      .references(() => resumes.id, { onDelete: "cascade" }),
    /** Who this was shared with, e.g. "Acme — Jane Recruiter". Burned into watermark. */
    recipientLabel: text("recipient_label").notNull(),
    note: text("note"),
    /** null = no expiry */
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }),
    /** argon2 hash; null = no password gate */
    passwordHash: text("password_hash"),
    /** null = unlimited */
    maxViews: integer("max_views"),
    /** Burn after reading: first session consumes the link. */
    oneTime: integer("one_time", { mode: "boolean" }).notNull().default(false),
    /** Serve with redaction zones masked. */
    redacted: integer("redacted", { mode: "boolean" }).notNull().default(false),
    /** Auto-lock the link when forwarding is suspected. */
    autoLockOnForward: integer("auto_lock_on_forward", { mode: "boolean" }).notNull().default(false),
    status: text("status").$type<"active" | "paused" | "revoked" | "locked">().notNull().default("active"),
    openCount: integer("open_count").notNull().default(0),
    firstOpenedAt: integer("first_opened_at", { mode: "timestamp_ms" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().$defaultFn(now),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull().$defaultFn(now),
  },
  (t) => [uniqueIndex("links_token_idx").on(t.token), index("links_resume_idx").on(t.resumeId)],
);

export const sessions = sqliteTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    linkId: text("link_id")
      .notNull()
      .references(() => links.id, { onDelete: "cascade" }),
    startedAt: integer("started_at", { mode: "timestamp_ms" }).notNull().$defaultFn(now),
    lastSeenAt: integer("last_seen_at", { mode: "timestamp_ms" }).notNull().$defaultFn(now),
    endedAt: integer("ended_at", { mode: "timestamp_ms" }),
    /** Salted SHA-256 of remote IP — never store raw IPs. */
    ipHash: text("ip_hash").notNull(),
    /** Salted SHA-256 of the User-Agent string. */
    uaHash: text("ua_hash").notNull(),
    /** Client-computed device fingerprint hash (screen/tz/lang/ua). */
    fingerprint: text("fingerprint").notNull(),
    /** Human-readable device summary, e.g. "Chrome · macOS". Non-identifying. */
    deviceLabel: text("device_label"),
    suspectedBot: integer("suspected_bot", { mode: "boolean" }).notNull().default(false),
    /** Redact-zone ids this session has explicitly revealed. */
    revealedZones: text("revealed_zones", { mode: "json" }).$type<string[]>().notNull().$defaultFn(() => []),
    engagementScore: real("engagement_score"),
  },
  (t) => [index("sessions_link_idx").on(t.linkId), index("sessions_fp_idx").on(t.linkId, t.fingerprint)],
);

export const events = sqliteTable(
  "events",
  {
    id: text("id").primaryKey(),
    sessionId: text("session_id")
      .notNull()
      .references(() => sessions.id, { onDelete: "cascade" }),
    linkId: text("link_id")
      .notNull()
      .references(() => links.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    pageIndex: integer("page_index"),
    zoneId: text("zone_id"),
    value: real("value"),
    meta: text("meta", { mode: "json" }).$type<Record<string, unknown>>(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().$defaultFn(now),
  },
  (t) => [
    index("events_session_idx").on(t.sessionId),
    index("events_link_created_idx").on(t.linkId, t.createdAt),
  ],
);

export const securityEvents = sqliteTable(
  "security_events",
  {
    id: text("id").primaryKey(),
    sessionId: text("session_id").references(() => sessions.id, { onDelete: "set null" }),
    linkId: text("link_id").references(() => links.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    meta: text("meta", { mode: "json" }).$type<Record<string, unknown>>(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().$defaultFn(now),
  },
  (t) => [index("security_events_link_idx").on(t.linkId, t.createdAt)],
);

export type ResumeRow = typeof resumes.$inferSelect;
export type ResumePageRow = typeof resumePages.$inferSelect;
export type LinkRow = typeof links.$inferSelect;
export type SessionRow = typeof sessions.$inferSelect;
export type EventRow = typeof events.$inferSelect;
export type SecurityEventRow = typeof securityEvents.$inferSelect;

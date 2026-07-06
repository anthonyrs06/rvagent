import { createHash, randomBytes, randomUUID } from "node:crypto";

import { env } from "~/lib/env.server";

export const newId = (): string => randomUUID();

/** 128-bit unguessable share token, URL-safe. */
export const newToken = (): string => randomBytes(16).toString("base64url");

/** Salted hash for IPs / UAs so raw identifying values are never persisted. */
export const saltedHash = (value: string): string =>
  createHash("sha256").update(`${env.ipHashSalt}:${value}`).digest("hex");

export const shortId = (id: string): string => id.replace(/-/g, "").slice(0, 6);

import { createHash } from "node:crypto";
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";

import { env } from "~/lib/env.server";

/**
 * Storage boundary. Local filesystem today; implement this interface with a
 * GCS-backed adapter when moving to Cloud Run (see NOTES.md) — call sites
 * never touch the filesystem directly.
 */
export interface StorageAdapter {
  put(key: string, data: Uint8Array): Promise<void>;
  get(key: string): Promise<Buffer>;
  exists(key: string): Promise<boolean>;
  remove(key: string): Promise<void>;
  removePrefix(prefix: string): Promise<void>;
}

class LocalFsStorage implements StorageAdapter {
  constructor(private readonly root: string) {}

  private resolve(key: string): string {
    const cleaned = path.normalize(key).replace(/^([/\\])+/, "");
    if (cleaned.startsWith("..")) throw new Error(`Unsafe storage key: ${key}`);
    return path.join(this.root, cleaned);
  }

  async put(key: string, data: Uint8Array): Promise<void> {
    const file = this.resolve(key);
    await mkdir(path.dirname(file), { recursive: true });
    // Write to a temp file then rename for atomicity on the same volume.
    const tmp = `${file}.${createHash("sha1").update(`${Date.now()}${Math.random()}`).digest("hex").slice(0, 8)}.tmp`;
    await writeFile(tmp, data);
    const { rename } = await import("node:fs/promises");
    await rename(tmp, file);
  }

  async get(key: string): Promise<Buffer> {
    return readFile(this.resolve(key));
  }

  async exists(key: string): Promise<boolean> {
    try {
      await stat(this.resolve(key));
      return true;
    } catch {
      return false;
    }
  }

  async remove(key: string): Promise<void> {
    await rm(this.resolve(key), { force: true });
  }

  async removePrefix(prefix: string): Promise<void> {
    await rm(this.resolve(prefix), { recursive: true, force: true });
  }
}

export const storage: StorageAdapter = new LocalFsStorage(path.join(env.dataDir, "storage"));

export const storageKeys = {
  original: (resumeId: string) => `resumes/${resumeId}/original.pdf`,
  page: (resumeId: string, pageIndex: number, tier: "lo" | "hi") =>
    `resumes/${resumeId}/pages/${pageIndex}-${tier}.webp`,
  resumePrefix: (resumeId: string) => `resumes/${resumeId}`,
};

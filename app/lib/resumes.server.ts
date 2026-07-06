import { and, desc, eq } from "drizzle-orm";

import { db, schema } from "~/db/index.server";
import { newId } from "~/lib/ids.server";
import { rasterizePdf } from "~/lib/rasterize.server";
import { storage, storageKeys } from "~/lib/storage.server";
import type { Zone } from "~/lib/types";

const { resumes, resumePages } = schema;

/**
 * Store the original PDF privately and rasterize it into per-page WebP tiers.
 * The original is only ever read again for future re-rasterization — it is
 * never served over HTTP.
 */
export async function createResume(label: string, pdf: Uint8Array) {
  const id = newId();
  await storage.put(storageKeys.original(id), pdf);
  await db.insert(resumes).values({
    id,
    label,
    originalKey: storageKeys.original(id),
    status: "processing",
  });

  try {
    const { pageCount, pages } = await rasterizePdf(pdf);
    for (const page of pages) {
      const loKey = storageKeys.page(id, page.pageIndex, "lo");
      const hiKey = storageKeys.page(id, page.pageIndex, "hi");
      await storage.put(loKey, page.lo.data);
      await storage.put(hiKey, page.hi.data);
      await db.insert(resumePages).values({
        id: newId(),
        resumeId: id,
        pageIndex: page.pageIndex,
        loKey,
        hiKey,
        loWidth: page.lo.width,
        loHeight: page.lo.height,
        hiWidth: page.hi.width,
        hiHeight: page.hi.height,
      });
    }
    await db
      .update(resumes)
      .set({ status: "ready", pageCount, updatedAt: new Date() })
      .where(eq(resumes.id, id));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Rasterization failed";
    await db
      .update(resumes)
      .set({ status: "failed", error: message, updatedAt: new Date() })
      .where(eq(resumes.id, id));
    throw error;
  }

  return getResume(id);
}

export async function getResume(id: string) {
  const [row] = await db.select().from(resumes).where(eq(resumes.id, id)).limit(1);
  return row ?? null;
}

export async function listResumes() {
  return db.select().from(resumes).orderBy(desc(resumes.createdAt));
}

export async function getResumePages(resumeId: string) {
  return db
    .select()
    .from(resumePages)
    .where(eq(resumePages.resumeId, resumeId))
    .orderBy(resumePages.pageIndex);
}

export async function getResumePage(resumeId: string, pageIndex: number) {
  const [row] = await db
    .select()
    .from(resumePages)
    .where(and(eq(resumePages.resumeId, resumeId), eq(resumePages.pageIndex, pageIndex)))
    .limit(1);
  return row ?? null;
}

export async function updateResumeZones(id: string, zones: Zone[]) {
  await db.update(resumes).set({ zones, updatedAt: new Date() }).where(eq(resumes.id, id));
}

export async function deleteResume(id: string) {
  await db.delete(resumes).where(eq(resumes.id, id));
  await storage.removePrefix(storageKeys.resumePrefix(id));
}

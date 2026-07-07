import sharp, { type OverlayOptions } from "sharp";

import { getResumePage } from "~/lib/resumes.server";
import { shortId } from "~/lib/ids.server";
import { storage } from "~/lib/storage.server";
import { centeredTextPathData, textPathData } from "~/lib/watermark-font.server";
import type { LinkRow, ResumeRow, SessionRow } from "~/db/schema";
import type { Zone } from "~/lib/types";

export type Tier = "lo" | "hi";

/**
 * Tiled diagonal watermark burned into the pixels server-side. Visible enough
 * to deter, light enough to read through. Includes recipient, date, and a
 * short session id so a leaked screenshot is traceable to one viewing session.
 *
 * Text is converted to SVG paths via opentype.js — Sharp on Linux cannot render
 * SVG &lt;text&gt; elements (no Pango in prebuilt libvips).
 */
export function watermarkSvg(width: number, height: number, label: string): Buffer {
  const fontSize = Math.max(14, Math.round(width / 55));
  const tileW = Math.max(360, label.length * fontSize * 0.62);
  const tileH = Math.round(tileW * 0.55);
  const pathD = textPathData(label, 0, tileH / 2, fontSize);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
  <defs>
    <pattern id="wm" width="${tileW}" height="${tileH}" patternUnits="userSpaceOnUse" patternTransform="rotate(-30)">
      <path d="${pathD}" fill="#1e293b" fill-opacity="0.10"/>
    </pattern>
  </defs>
  <rect width="100%" height="100%" fill="url(#wm)"/>
</svg>`;
  return Buffer.from(svg);
}

/** Solid boxes over redacted zones, composited *before* the watermark. */
function redactionSvg(width: number, height: number, zones: Zone[], hidden: Set<string>): Buffer | null {
  const boxes = zones
    .filter((z) => z.kind === "redact" && hidden.has(z.id))
    .map((z) => {
      const x = Math.round(z.x * width);
      const y = Math.round(z.y * height);
      const w = Math.round(z.w * width);
      const h = Math.round(z.h * height);
      const fontSize = Math.max(11, Math.min(16, h * 0.32));
      const hiddenPath = centeredTextPathData("hidden", x, y, w, h, fontSize);
      return `<g><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="6" fill="#0f172a"/>
<path d="${hiddenPath}" fill="#64748b"/></g>`;
    });
  if (boxes.length === 0) return null;
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">${boxes.join("")}</svg>`,
  );
}

const CACHE_MAX_ENTRIES = 120;

/**
 * Session-scoped composited-tile cache. Key includes revealed zones so a
 * reveal invalidates naturally. Simple LRU via Map insertion order.
 */
declare global {
  // eslint-disable-next-line no-var
  var __rvTileCache: Map<string, Buffer> | undefined;
}
const tileCache: Map<string, Buffer> = globalThis.__rvTileCache ?? new Map();
globalThis.__rvTileCache = tileCache;

function cacheGet(key: string): Buffer | undefined {
  const hit = tileCache.get(key);
  if (hit) {
    tileCache.delete(key);
    tileCache.set(key, hit);
  }
  return hit;
}

function cacheSet(key: string, value: Buffer): void {
  tileCache.set(key, value);
  while (tileCache.size > CACHE_MAX_ENTRIES) {
    const oldest = tileCache.keys().next().value;
    if (oldest === undefined) break;
    tileCache.delete(oldest);
  }
}

export interface ComposeResult {
  data: Buffer;
  width: number;
  height: number;
}

/**
 * Load a rasterized page and burn in (1) redaction boxes still hidden for
 * this session and (2) the per-session forensic watermark.
 */
export async function composePageForSession(
  resume: ResumeRow,
  link: LinkRow,
  session: SessionRow,
  pageIndex: number,
  tier: Tier,
): Promise<ComposeResult | null> {
  const page = await getResumePage(resume.id, pageIndex);
  if (!page) return null;

  const key = tier === "hi" ? page.hiKey : page.loKey;
  const width = tier === "hi" ? page.hiWidth : page.loWidth;
  const height = tier === "hi" ? page.hiHeight : page.loHeight;

  const revealed = new Set(session.revealedZones);
  const hiddenZoneIds = new Set(
    resume.zones.filter((z) => z.kind === "redact" && !revealed.has(z.id)).map((z) => z.id),
  );

  const cacheKey = [
    session.id,
    pageIndex,
    tier,
    link.redacted ? [...hiddenZoneIds].sort().join(",") : "clear",
  ].join("|");
  const cached = cacheGet(cacheKey);
  if (cached) return { data: cached, width, height };

  const base = await storage.get(key);
  const overlays: OverlayOptions[] = [];

  if (link.redacted) {
    const zonesOnPage = resume.zones.filter((z) => z.pageIndex === pageIndex);
    const redaction = redactionSvg(width, height, zonesOnPage, hiddenZoneIds);
    if (redaction) overlays.push({ input: redaction, top: 0, left: 0 });
  }

  const label = `Shared with ${link.recipientLabel} · ${new Date().toISOString().slice(0, 10)} · s_${shortId(session.id)}`;
  overlays.push({ input: watermarkSvg(width, height, label), top: 0, left: 0 });

  const data = await sharp(base).composite(overlays).webp({ quality: 80 }).toBuffer();
  cacheSet(cacheKey, data);
  return { data, width, height };
}

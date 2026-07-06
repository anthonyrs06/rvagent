import * as mupdf from "mupdf";
import sharp from "sharp";

/** Screen tier: 144 DPI. Zoom tier: 288 DPI. PDF native is 72 DPI. */
const LO_SCALE = 2;
const HI_SCALE = 4;
const WEBP_QUALITY = 82;
/** Resumes are short documents; refuse anything that looks like a book. */
const MAX_PAGES = 20;

export interface RenderedTier {
  data: Buffer;
  width: number;
  height: number;
}

export interface RenderedPage {
  pageIndex: number;
  lo: RenderedTier;
  hi: RenderedTier;
}

function renderPage(doc: mupdf.Document, pageIndex: number, scale: number): RenderedTier {
  const page = doc.loadPage(pageIndex);
  try {
    const pixmap = page.toPixmap(
      mupdf.Matrix.scale(scale, scale),
      mupdf.ColorSpace.DeviceRGB,
      false,
      true,
    );
    try {
      return {
        data: Buffer.from(pixmap.asPNG()),
        width: pixmap.getWidth(),
        height: pixmap.getHeight(),
      };
    } finally {
      pixmap.destroy();
    }
  } finally {
    page.destroy();
  }
}

async function toWebp(tier: RenderedTier): Promise<RenderedTier> {
  return {
    ...tier,
    data: await sharp(tier.data).webp({ quality: WEBP_QUALITY }).toBuffer(),
  };
}

export function assertLooksLikePdf(data: Uint8Array): void {
  const head = Buffer.from(data.subarray(0, 8)).toString("latin1");
  if (!head.startsWith("%PDF-")) {
    throw new Error("File does not look like a PDF (missing %PDF header).");
  }
}

/**
 * Rasterize every page of a PDF into two WebP zoom tiers.
 * CPU-bound but runs once per upload, never per view.
 */
export async function rasterizePdf(pdf: Uint8Array): Promise<{ pageCount: number; pages: RenderedPage[] }> {
  assertLooksLikePdf(pdf);
  const doc = mupdf.Document.openDocument(Buffer.from(pdf), "application/pdf");
  try {
    const pageCount = doc.countPages();
    if (pageCount === 0) throw new Error("PDF has no pages.");
    if (pageCount > MAX_PAGES) {
      throw new Error(`PDF has ${pageCount} pages; the limit is ${MAX_PAGES}.`);
    }
    const pages: RenderedPage[] = [];
    for (let i = 0; i < pageCount; i++) {
      const [lo, hi] = await Promise.all([
        toWebp(renderPage(doc, i, LO_SCALE)),
        toWebp(renderPage(doc, i, HI_SCALE)),
      ]);
      pages.push({ pageIndex: i, lo, hi });
    }
    return { pageCount, pages };
  } finally {
    doc.destroy();
  }
}

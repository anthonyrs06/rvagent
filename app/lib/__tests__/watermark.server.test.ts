import sharp from "sharp";
import { describe, expect, it } from "vitest";

import { watermarkSvg } from "~/lib/watermark.server";

/** Sample mean absolute deviation of grayscale luminance — detects rendered text vs flat fill. */
async function luminanceVariance(png: Buffer): Promise<number> {
  const { data, info } = await sharp(png).grayscale().raw().toBuffer({ resolveWithObject: true });
  const pixels = data.length;
  let sum = 0;
  for (let i = 0; i < pixels; i++) sum += data[i]!;
  const mean = sum / pixels;
  let mad = 0;
  for (let i = 0; i < pixels; i++) mad += Math.abs(data[i]! - mean);
  return mad / pixels;
}

describe("watermarkSvg", () => {
  it("renders readable text (non-flat luminance) when rasterized", async () => {
    const label = "Shared with Acme — Jane Recruiter · 2026-07-06 · s_abc123";
    const svg = watermarkSvg(800, 600, label);
    const png = await sharp(svg).png().toBuffer();

    const withText = await luminanceVariance(png);
    const emptySvg = Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600"><rect width="100%" height="100%" fill="white"/></svg>`,
    );
    const emptyPng = await sharp(emptySvg).png().toBuffer();
    const flat = await luminanceVariance(emptyPng);

    expect(withText).toBeGreaterThan(flat * 2);
    expect(withText).toBeGreaterThan(0.5);
  });
});

import sharp from "sharp";

import { watermarkSvg } from "../app/lib/watermark.server";

async function luminanceVariance(png: Buffer): Promise<number> {
  const { data } = await sharp(png).grayscale().raw().toBuffer({ resolveWithObject: true });
  const pixels = data.length;
  let sum = 0;
  for (let i = 0; i < pixels; i++) sum += data[i]!;
  const mean = sum / pixels;
  let mad = 0;
  for (let i = 0; i < pixels; i++) mad += Math.abs(data[i]! - mean);
  return mad / pixels;
}

const label = "Shared with test 3 · 2026-07-06 · s_abc123";
const svg = watermarkSvg(800, 600, label);
const png = await sharp(svg).png().toBuffer();
const variance = await luminanceVariance(png);
console.log(`luminance MAD: ${variance.toFixed(2)}`);
if (variance < 0.5) {
  console.error("FAIL: watermark text did not render (flat image)");
  process.exit(1);
}
console.log("OK: watermark text renders");

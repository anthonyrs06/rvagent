import { readFileSync } from "node:fs";
import { join } from "node:path";

import opentype from "opentype.js";

let cachedFont: opentype.Font | undefined;

function fontPath(): string {
  return join(process.cwd(), "assets/fonts/DejaVuSans.ttf");
}

/** Avoid opentype GSUB failures on em-dashes / middle dots in recipient labels. */
function normalizeLabelText(text: string): string {
  return text
    .replaceAll("\u2014", "-")
    .replaceAll("\u2013", "-")
    .replaceAll("\u00b7", "-");
}

export function loadWatermarkFont(): opentype.Font {
  if (!cachedFont) {
    cachedFont = opentype.parse(readFileSync(fontPath()));
  }
  return cachedFont;
}

/** SVG path data for label text — avoids SVG &lt;text&gt; (unsupported by Sharp on Linux). */
/** Build path glyph-by-glyph to skip opentype GSUB features unsupported in DejaVu. */
export function textPathData(text: string, x: number, y: number, fontSize: number): string {
  const safe = normalizeLabelText(text);
  const font = loadWatermarkFont();
  const path = new opentype.Path();
  let xCursor = x;
  for (const char of safe) {
    const glyph = font.charToGlyph(char);
    path.extend(glyph.getPath(xCursor, y, fontSize));
    xCursor += font.getAdvanceWidth(char, fontSize);
  }
  return path.toPathData(2);
}

/** Centered path for short labels inside a box (e.g. redaction "hidden"). */
export function centeredTextPathData(
  text: string,
  boxX: number,
  boxY: number,
  boxW: number,
  boxH: number,
  fontSize: number,
): string {
  const font = loadWatermarkFont();
  const safe = normalizeLabelText(text);
  let width = 0;
  for (const char of safe) width += font.getAdvanceWidth(char, fontSize);
  const x = boxX + (boxW - width) / 2;
  const y = boxY + boxH / 2 + fontSize * 0.35;
  return textPathData(safe, x, y, fontSize);
}

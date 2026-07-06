/**
 * Smoke test: rasterize data/sample-resume.pdf through the real pipeline and
 * report tier dimensions/sizes. Run: npx tsx scripts/smoke-rasterize.ts
 */
import { readFileSync } from "node:fs";

import { rasterizePdf } from "../app/lib/rasterize.server";

const pdf = readFileSync("data/sample-resume.pdf");
const out = await rasterizePdf(pdf);
console.log("pages:", out.pageCount);
for (const p of out.pages) {
  console.log(
    ` page ${p.pageIndex}: lo ${p.lo.width}x${p.lo.height} ${(p.lo.data.length / 1024).toFixed(0)}KB · hi ${p.hi.width}x${p.hi.height} ${(p.hi.data.length / 1024).toFixed(0)}KB`,
  );
}

/**
 * Generates a two-page sample "resume" PDF at data/sample-resume.pdf using
 * mupdf, for local smoke-testing the upload → rasterize → view pipeline
 * without touching a real resume.
 *
 * Run: npx tsx scripts/make-sample-pdf.ts
 */
import { mkdirSync, writeFileSync } from "node:fs";

import * as mupdf from "mupdf";

const doc = new mupdf.PDFDocument();
const font = doc.addSimpleFont(new mupdf.Font("Helvetica"));
const resources = doc.addObject({ Font: { F1: font } });

const pageText = [
  [
    "Jordan Sample",
    "Senior Software Engineer",
    "jordan.sample@example.com  ·  +1 (555) 010-1234  ·  Example City",
    "",
    "EXPERIENCE",
    "Acme Corp — Staff Engineer (2022—present)",
    "  Led the platform team; cut infra spend 38%.",
    "Globex — Senior Engineer (2018—2022)",
    "  Shipped the billing rewrite; 99.99% uptime.",
    "",
    "SKILLS",
    "TypeScript, React, Node.js, GCP, Terraform, SQL",
  ],
  [
    "EDUCATION",
    "B.S. Computer Science, Example University (2014)",
    "",
    "PROJECTS",
    "Resume Vault — secure resume sharing with analytics.",
    "OpenSource — maintainer of several developer tools.",
    "",
    "References available on request.",
  ],
];

for (const lines of pageText) {
  const contents = lines
    .map((line, i) => {
      const y = 760 - i * 28;
      const esc = line.replace(/[\\()]/g, (c) => `\\${c}`);
      const size = i === 0 ? 24 : 12;
      return `BT /F1 ${size} Tf 56 ${y} Td (${esc}) Tj ET`;
    })
    .join("\n");
  const page = doc.addPage([0, 0, 612, 792], 0, resources, contents);
  doc.insertPage(-1, page);
}

mkdirSync("data", { recursive: true });
const bytes = doc.saveToBuffer("").asUint8Array();
writeFileSync("data/sample-resume.pdf", bytes);
console.log(`Wrote data/sample-resume.pdf (${bytes.byteLength} bytes, ${doc.countPages()} pages)`);

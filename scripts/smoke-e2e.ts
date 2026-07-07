/**
 * End-to-end smoke test of the server pipeline (no HTTP): upload + rasterize,
 * create a link, validate it, start a session, compose a watermarked tile,
 * ingest events, and summarize analytics. Writes the composed tile to
 * data/smoke-tile.webp for eyeballing.
 *
 * Run: npx tsx scripts/smoke-e2e.ts
 */
import { readFileSync, writeFileSync } from "node:fs";

process.env.DATA_DIR ??= "./data";
process.env.SESSION_SECRET ??= "smoke-secret-smoke-secret-smoke!";
process.env.OWNER_PASSWORD ??= "smoke";

const { createResume } = await import("../app/lib/resumes.server");
const { createLink, validateLink } = await import("../app/lib/links.server");
const { startSession, getAuthorizedSession } = await import("../app/lib/sessions.server");
const { composePageForSession } = await import("../app/lib/watermark.server");
const { ingestClientEvents, summarizeSession } = await import("../app/lib/events.server");
const { getResume } = await import("../app/lib/resumes.server");

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`ASSERT FAILED: ${msg}`);
  console.log(`  ok: ${msg}`);
}

const pdf = new Uint8Array(readFileSync("data/sample-resume.pdf"));

console.log("1. upload + rasterize");
const resume = await createResume("Smoke Test Resume", pdf);
assert(resume, "resume created");
assert(resume!.status === "ready", `status ready (got ${resume!.status})`);
assert(resume!.pageCount === 2, `page count 2 (got ${resume!.pageCount})`);

console.log("2. create link (7-day TTL, one-time off)");
const link = await createLink({
  resumeId: resume!.id,
  recipientLabel: "Acme — Jane Recruiter",
  ttlMs: 7 * 24 * 3600 * 1000,
});
assert(link.token.length >= 20, "token looks unguessable");

console.log("3. validate link");
const v = await validateLink(link.token, { forNewSession: true });
assert(v.ok, "link validates for a new session");

console.log("4. start session");
const req = new Request("https://vault.test/r/" + link.token, {
  headers: { "user-agent": "Mozilla/5.0 (Macintosh) Chrome/120 Safari/537", "accept-language": "en-US" },
});
const { session, cookieHeader } = await startSession(req, link, resume!.label, {
  fingerprint: "a".repeat(32),
  suspectedBot: false,
});
assert(session.id, "session created");
assert(cookieHeader.includes("rv_viewer="), "viewer cookie issued");

console.log("5. authorize a follow-up request with the cookie");
const cookie = cookieHeader.split(";")[0];
const authedReq = new Request("https://vault.test/api/viewer/page/0", { headers: { Cookie: cookie } });
const auth = await getAuthorizedSession(authedReq);
assert(auth, "cookie authorizes the session");
assert(auth!.session.id === session.id, "authorized session matches");

console.log("6. compose watermarked tiles");
const freshResume = await getResume(resume!.id);
const tile0 = await composePageForSession(freshResume!, link, session, 0, "lo");
assert(tile0 && tile0.data.length > 1000, "page 0 composited");
const tile1 = await composePageForSession(freshResume!, link, session, 1, "hi");
assert(tile1 && tile1.data.length > 1000, "page 1 hi composited");

const { getResumePage } = await import("../app/lib/resumes.server");
const { storage } = await import("../app/lib/storage.server");
const page0 = await getResumePage(freshResume!.id, 0);
const baseTile = page0 ? await storage.get(page0.loKey) : null;
assert(baseTile && !tile0!.data.equals(baseTile), "watermark overlay applied (tile differs from base)");

writeFileSync("data/smoke-tile.webp", tile0!.data);
console.log(
  `   wrote data/smoke-tile.webp (${(tile0!.data.length / 1024).toFixed(0)}KB, ${tile0!.width}x${tile0!.height})`,
);
console.log("   eyeball data/smoke-tile.webp — tiled recipient label text should be readable");

console.log("7. ingest events (page views + dwell)");
await ingestClientEvents(session, link, [
  { type: "open", at: Date.now() },
  { type: "page_view", at: Date.now(), pageIndex: 0 },
  { type: "page_dwell", at: Date.now(), pageIndex: 0, value: 45000 },
  { type: "page_view", at: Date.now(), pageIndex: 1 },
  { type: "page_dwell", at: Date.now(), pageIndex: 1, value: 30000 },
  { type: "print_attempt", at: Date.now() },
]);

console.log("8. summarize session analytics");
const summary = await summarizeSession(session, link, resume!.pageCount, freshResume!.zones);
assert(summary.pagesSeen.length === 2, `saw 2 pages (got ${summary.pagesSeen.length})`);
assert(summary.activeMs === 75000, `active ms 75000 (got ${summary.activeMs})`);
assert(summary.score > 0, `engagement score computed (${summary.score})`);
console.log(`   engagement score: ${summary.score}/100, activeMs=${summary.activeMs}, pages=${summary.pagesSeen.join(",")}`);

console.log("\nALL SMOKE CHECKS PASSED");
process.exit(0);

# For future me

Working notes on *why* things are the way they are. Newest first.

## Bot-guard false positive (2026-07-06)

- Symptom: the owner previewing a link inside Cursor's built-in browser got the
  "This is a private document" (reason: bot) screen. `security_events` showed
  `bot_suspected / isbot_match` at `page_load`.
- Cause: `isbot()` classifies Electron/embedded user agents as bots, and the
  loader hard-blocked on *any* `assessRequest().suspected`.
- Fix: separated `hardBlock` (deny) from `suspected` (telemetry). Only proof
  denies — `AUTOMATION_UA` tokens, `navigator.webdriver === true`, or
  `no_client_signals` (a scripted POST that skipped the JS gate). A bare isbot
  match now only sets the session's "suspected bot" badge. This is *stronger*
  security, not weaker: UA strings are trivially spoofed, so enforcing on
  behavior (webdriver + JS execution) is what actually matters, and no resume
  pixels are ever exposed before the JS challenge + session cookie anyway.

## UI + verification decisions (2026-07-06)

- **Pixels only ever live in `<canvas>`**: there is no `<img>` for resume
  pages in the viewer, so long-press-save, drag-out, and "open image in new
  tab" have nothing to grab. The admin console *does* use `<img>` against the
  admin-only clean endpoint — the owner is allowed to see their own resume.
- **Reveal invalidation via version param**: after a click-to-reveal, the
  client bumps `&v=N` on the tile URL. The server ignores it (auth is the
  cookie; redaction state lives in the session row) — it exists purely to
  bypass the browser's memory cache.
- **The dwell ticker attributes to the viewport-center page** and to section
  rects intersecting the middle 60% band — cheap, robust to zoom, and matches
  how people actually read. Client dwell values are untrusted inputs summed
  server-side; a hostile viewer could inflate their own engagement score,
  which only misleads the owner about that viewer — acceptable.
- **`window.confirm`-style flows avoided in the zone editor**: unsaved-changes
  guard uses `useBlocker` + `beforeunload` so saving doesn't fight the guard.
- **Exhausted links short-circuit at the loader** (`linkBudgetExhausted`)
  so burn-after-reading URLs show "view limit reached" rather than a
  password form that can only fail — found via curl e2e, fixed same commit.
- **e2e verification is curl-first** (`scripts/smoke-e2e.ts` for the service
  layer, curl for HTTP): headless-browser testing would trip our own bot
  detection, which is a feature, not a bug.

## Server core decisions (2026-07-06)

- **Tile auth is the cookie, not the URL**: `/api/viewer/page/:n` has no token
  in the URL; the signed httpOnly session cookie authorizes it. Copying a tile
  URL out of devtools yields 401 in any other browser — no signed-URL leakage
  window to reason about.
- **Watermarks are burned into pixels server-side** (sharp SVG composite), not
  CSS overlays — an overlay disappears with one devtools delete. Cost is one
  composite per (session, page, tier, reveal-state), amortized by an in-memory
  LRU keyed to include revealed zones so reveals invalidate naturally.
- **Client timestamps are untrusted**: event ingest stores server receive
  time; the client `at` only orders events within a batch.
- **Forwarding detection threshold**: 3+ distinct device fingerprints per link
  within 48h. The fingerprint is deliberately coarse (UA/screen/tz/lang) —
  it only needs equality, and one Slack alert per link avoids alert fatigue.
  Auto-lock is opt-in per link because a recruiter legitimately switching
  phone→laptop→office desktop would hit 3 devices.
- **Turnstile fails closed** when configured but unreachable; when *not*
  configured it admits everyone (local-first default, zero external accounts).
- **isbot at the page loader** returns a contentless "unavailable" page to
  crawlers — this is also what keeps Slack/iMessage link-preview bots from
  ever fetching resume pixels.
- **PostHog distinct ids** are `viewer:<sessionId>` / `link:<linkId>`; the
  share token itself is hashed client-side before being attached to events.

## Scaffold decisions (2026-07-06)

- **libsql over better-sqlite3**: `@libsql/client` with a `file:` URL gives the
  same embedded SQLite but ships prebuilt binaries for every platform incl.
  musl, and its Drizzle driver is async — so swapping to Turso/Cloud SQL later
  changes a connection string, not call sites.
- **mupdf (WASM) over poppler/pdfium**: zero system dependencies, so the
  Dockerfile stays a stock `node:alpine` and local dev needs no `brew install`.
  Rasterization is CPU-bound but happens once per upload, not per view.
- **Storage behind `StorageAdapter`**: the GCP move only needs a GCS
  implementation of five methods (`put/get/exists/remove/removePrefix`).
  Keys are already flat object-style paths (`resumes/{id}/pages/0-hi.webp`).
- **Salted hashes for IP/UA from day one**: never persist raw viewer
  identifiers; forwarding detection only needs equality, not the raw value.
- **Zones stored on the resume row as JSON**: redaction boxes and analytics
  sections are one editing surface in normalized 0..1 page coords, so they
  survive re-rasterization at any DPI.
- **Migrations at boot** (`drizzle/` committed): a fresh clone or container
  self-initializes; no manual `db push` step to forget.

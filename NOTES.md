# For future me

Working notes on *why* things are the way they are. Newest first.

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

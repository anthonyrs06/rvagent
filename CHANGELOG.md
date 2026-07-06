# Changelog

All notable changes to Resume Vault, newest first.

## Unreleased

- Fix: drawing a box in the zone editor crashed with "Cannot read properties
  of null (reading 'getBoundingClientRect')". `pointerCoords(e)` was called
  inside a `setDraft` updater, which React runs during render (twice under
  StrictMode) after `e.currentTarget` is already null. Pointer geometry is now
  resolved synchronously in the handler; only plain numbers enter the updater,
  with a synchronous `drawingRef` guard so no drag frame is dropped.

- Fix: legitimate embedded/Electron browsers (Cursor's preview, desktop
  in-app browsers) were shown the "private document" bot screen because a bare
  `isbot()` user-agent match hard-blocked at page load. Bot denial now
  requires behavioral proof — explicit automation UA tokens
  (`HeadlessChrome`, `curl`, `puppeteer`, ...), `navigator.webdriver`, or a
  scripted POST with no JS-collected signals. Fuzzy `isbot` matches are
  demoted to a dashboard "suspected" flag. Added `botguard` unit tests.

- Viewer UI: gated entry (password + invisible Turnstile + honest logging
  disclosure), canvas-only page rendering with lazy tiles and zoom tiers,
  protection pack (right-click/copy/print/shortcut blocking, blank print CSS,
  blur-on-blur, devtools banner, PrintScreen response), click-to-reveal
  overlays for redacted zones, and per-page/section dwell tracking.
- Admin console: dashboard (stat cards, 30-day opens chart, recent sessions,
  security feed, live refresh), resume upload with status, drag-to-draw zone
  editor (redactions + named sections), link management (TTL presets,
  password, max views, one-time, redacted, auto-lock, revoke/pause), and
  per-link analytics with attention map, page drop-off bars, session
  timelines, and engagement scores.
- Hardening: exhausted one-time/max-view links show the unavailable screen
  instead of a gate that can only fail.
- Verified end-to-end over HTTP: upload → link → gate → watermarked tiles →
  events → analytics → revoke (tiles 401 immediately); password gate,
  redaction + logged reveal, burn-after-reading, and forwarding detection at
  the third distinct device.
- Server core: PDF rasterization (mupdf → 2 WebP tiers), link service
  (TTL/password/max-views/one-time/revoke), gated viewer sessions with signed
  cookies, per-session watermark compositing with an LRU tile cache,
  first-party event ingest + engagement scoring, forwarding detection with
  optional auto-lock, bot guard (isbot + client signals + Turnstile hook),
  Slack notifications, PostHog wiring (privacy config, server mirror, HogQL),
  security headers/CSP, and unit tests for scoring + privacy sanitizer.
- Scaffold: React Router 7 (SSR) + TypeScript + Tailwind 4, Drizzle/SQLite
  schema with auto-migrations at boot, local-FS `StorageAdapter`, env
  validation, Dockerfile, and project docs.

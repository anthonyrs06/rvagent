# Changelog

All notable changes to Resume Vault, newest first.

## Unreleased

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

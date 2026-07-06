# Resume Vault

A self-hosted, secure resume viewer. Your PDF never leaves the server — viewers
see watermarked page images through expiring, optionally password-protected
links, and you get a private dashboard showing exactly who looked at what.

## Why

Sharing a resume PDF in early conversations means losing control of it: it gets
forwarded, scraped, and your phone/email end up in places you never intended.
Resume Vault replaces the attachment with a controlled viewing room:

- **No downloads.** The original PDF is stored privately and only rasterized
  WebP page images are served, watermarked per viewing session.
- **No scraping.** There is no text layer in the DOM; bots hit a challenge,
  rate limits, and unguessable 128-bit tokens.
- **Traceable leaks.** Every page is stamped "Shared with {recipient} · {date}
  · {session}" — a screenshot identifies its source.
- **Controlled access.** Links expire (24h/7d/30d/custom), can require a
  password, cap total views, burn after one reading, and can be revoked,
  paused, or auto-locked when forwarding is suspected.
- **Real analytics.** First-party event timeline (opens, page dwell, section
  attention, reveals, security events) plus optional PostHog session replay
  and heatmaps.
- **PII stays masked.** Draw redaction boxes over phone/email; viewers see
  black boxes unless they click to reveal — and every reveal is logged.

## Honest security model

Downloads, text scraping, bots, and stale links are genuinely prevented.
OS-level screenshots and phone photos **cannot** be blocked by any web page —
the mitigation here is forensic (burned-in per-session watermarks), plus
forwarding detection and short TTLs. Know the difference before trusting any
tool that claims otherwise.

## Stack

React Router 7 (SSR) · TypeScript · Tailwind 4 · SQLite via Drizzle ORM ·
mupdf (WASM) for PDF rasterization · sharp for watermark compositing ·
PostHog (optional) · Cloudflare Turnstile (optional) · Slack webhooks
(optional). Storage and DB sit behind small adapters so the GCP move
(Cloud Run + GCS + Cloud SQL + Auth0) is an infra task, not a rewrite.

## Getting started

```bash
cp .env.example .env      # fill in SESSION_SECRET + OWNER_PASSWORD at minimum
npm install
npm run dev               # http://localhost:5173
```

1. Open `/admin`, log in with `OWNER_PASSWORD`.
2. Upload your resume PDF (it is rasterized on upload).
3. Create a share link — recipient label, TTL, optional password/max views.
4. Send the `/r/<token>` URL. Watch the dashboard.

## Scripts

| Script              | What it does                       |
| ------------------- | ---------------------------------- |
| `npm run dev`       | Dev server with HMR                |
| `npm run build`     | Production build                   |
| `npm run start`     | Serve the production build         |
| `npm run typecheck` | React Router typegen + `tsc`       |
| `npm test`          | Vitest unit tests                  |
| `npm run db:generate` | Generate SQL migrations from schema |
| `npm run smoke`     | End-to-end pipeline smoke test (uses a generated sample PDF) |

Migrations run automatically at boot from `./drizzle`.

## Docker

```bash
docker build -t resume-vault .
docker run -p 3000:3000 --env-file .env -v "$PWD/data:/app/data" resume-vault
```

## Data & privacy

Everything lives in `DATA_DIR` (default `./data`): the SQLite database and the
stored PDFs/page images. Raw viewer IPs and user agents are never persisted —
only salted hashes. PostHog, Turnstile, and Slack are strictly opt-in via env.

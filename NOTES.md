# For future me

Working notes on *why* things are the way they are. Newest first.

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

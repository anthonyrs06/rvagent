/**
 * Deny all crawlers everywhere. Share links must never be indexed even if one
 * leaks into a crawlable page.
 */
export function loader() {
  return new Response("User-agent: *\nDisallow: /\n", {
    headers: { "Content-Type": "text/plain", "Cache-Control": "public, max-age=3600" },
  });
}

import { getResume } from "~/lib/resumes.server";
import { rateLimit } from "~/lib/rate-limit.server";
import { getAuthorizedSession, touchSession } from "~/lib/sessions.server";
import { composePageForSession } from "~/lib/watermark.server";
import type { Route } from "./+types/api.viewer.page";

/**
 * Watermarked page tiles. Authorization is the signed session cookie — tile
 * URLs are useless outside the viewer session that requested them.
 */
export async function loader({ request, params }: Route.LoaderArgs) {
  const auth = await getAuthorizedSession(request);
  if (!auth) throw new Response("Unauthorized", { status: 401 });

  const limit = rateLimit(`tiles:${auth.session.id}`, 240, 60_000);
  if (!limit.allowed) throw new Response("Too Many Requests", { status: 429 });

  const pageIndex = Number.parseInt(params.pageIndex ?? "", 10);
  if (!Number.isInteger(pageIndex) || pageIndex < 0) {
    throw new Response("Bad Request", { status: 400 });
  }
  const tier = new URL(request.url).searchParams.get("tier") === "hi" ? "hi" : "lo";

  const resume = await getResume(auth.link.resumeId);
  if (!resume) throw new Response("Not Found", { status: 404 });

  const composed = await composePageForSession(resume, auth.link, auth.session, pageIndex, tier);
  if (!composed) throw new Response("Not Found", { status: 404 });

  await touchSession(auth.session.id);

  return new Response(new Uint8Array(composed.data), {
    headers: {
      "Content-Type": "image/webp",
      // Never cache: every byte served is per-session watermarked.
      "Cache-Control": "private, no-store",
      "X-Robots-Tag": "noindex",
    },
  });
}

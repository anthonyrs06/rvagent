import { db, schema } from "~/db/index.server";
import { newId } from "~/lib/ids.server";
import { notifyReveal } from "~/lib/notify.server";
import { getResume } from "~/lib/resumes.server";
import { rateLimit } from "~/lib/rate-limit.server";
import { addRevealedZone, getAuthorizedSession } from "~/lib/sessions.server";
import type { Route } from "./+types/api.viewer.reveal";

/**
 * Click-to-reveal for redacted zones. Every reveal is logged and notified —
 * that audit trail is the point of masking contact info by default.
 */
export async function action({ request }: Route.ActionArgs) {
  if (request.method !== "POST") throw new Response("Method Not Allowed", { status: 405 });

  const auth = await getAuthorizedSession(request);
  if (!auth) throw new Response("Unauthorized", { status: 401 });

  const limit = rateLimit(`reveal:${auth.session.id}`, 30, 60_000);
  if (!limit.allowed) throw new Response("Too Many Requests", { status: 429 });

  const body = (await request.json().catch(() => null)) as { zoneId?: string } | null;
  const zoneId = body?.zoneId;
  if (!zoneId || typeof zoneId !== "string") throw new Response("Bad Request", { status: 400 });

  if (!auth.link.redacted) throw new Response("Conflict", { status: 409 });

  const resume = await getResume(auth.link.resumeId);
  const zone = resume?.zones.find((z) => z.id === zoneId);
  if (!resume || !zone || zone.kind !== "redact") throw new Response("Not Found", { status: 404 });
  if (!zone.revealable) throw new Response("Forbidden", { status: 403 });

  await addRevealedZone(auth.session, zoneId);
  await db.insert(schema.events).values({
    id: newId(),
    sessionId: auth.session.id,
    linkId: auth.link.id,
    type: "reveal_click",
    pageIndex: zone.pageIndex,
    zoneId,
    value: null,
    meta: { label: zone.label },
  });
  notifyReveal(auth.link.recipientLabel, zone.label);

  return Response.json({ ok: true, zoneId });
}

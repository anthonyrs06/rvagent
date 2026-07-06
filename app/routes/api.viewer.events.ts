import { ingestClientEvents } from "~/lib/events.server";
import { rateLimit } from "~/lib/rate-limit.server";
import { endSession, getAuthorizedSession, touchSession } from "~/lib/sessions.server";
import type { Route } from "./+types/api.viewer.events";

/**
 * First-party interaction ingest. Batched by the client tracker; also hit via
 * navigator.sendBeacon on unload, hence the tolerant body parsing.
 */
export async function action({ request }: Route.ActionArgs) {
  if (request.method !== "POST") throw new Response("Method Not Allowed", { status: 405 });

  const auth = await getAuthorizedSession(request);
  if (!auth) throw new Response("Unauthorized", { status: 401 });

  const limit = rateLimit(`events:${auth.session.id}`, 120, 60_000);
  if (!limit.allowed) throw new Response("Too Many Requests", { status: 429 });

  let body: unknown = null;
  try {
    body = JSON.parse(await request.text());
  } catch {
    throw new Response("Bad Request", { status: 400 });
  }
  const rawEvents = (body as { events?: unknown })?.events;

  await ingestClientEvents(auth.session, auth.link, rawEvents);
  await touchSession(auth.session.id);

  if (Array.isArray(rawEvents) && rawEvents.some((e) => (e as { type?: string })?.type === "session_end")) {
    await endSession(auth.session.id);
  }

  return new Response(null, { status: 204 });
}

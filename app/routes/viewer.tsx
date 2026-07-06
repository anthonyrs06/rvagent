import { data, redirect } from "react-router";

import { GateScreen } from "~/components/viewer/gate-screen";
import { UnavailableScreen } from "~/components/viewer/unavailable-screen";
import { ViewerScreen } from "~/components/viewer/viewer-screen";
import {
  assessClientSignals,
  assessRequest,
  verifyTurnstile,
  type ClientSignals,
} from "~/lib/botguard.server";
import { env } from "~/lib/env.server";
import { logServerEvent } from "~/lib/events.server";
import { validateLink, verifyLinkPassword } from "~/lib/links.server";
import { captureServer } from "~/lib/posthog.server";
import { clientIp, rateLimit } from "~/lib/rate-limit.server";
import { getResumePages } from "~/lib/resumes.server";
import { getAuthorizedSession, startSession } from "~/lib/sessions.server";
import type { GateActionError, ViewerLoaderData } from "~/lib/viewer-contracts";
import type { Route } from "./+types/viewer";

export function meta(_: Route.MetaArgs) {
  // Deliberately generic: link previews and titles must never leak content.
  return [{ title: "Private document" }, { name: "robots", content: "noindex, nofollow" }];
}

export async function loader({ request, params }: Route.LoaderArgs): Promise<ViewerLoaderData> {
  const ip = clientIp(request);
  if (!rateLimit(`viewer:${ip}`, 120, 60_000).allowed) {
    throw new Response("Too Many Requests", { status: 429 });
  }

  const validation = await validateLink(params.token, { forNewSession: false });
  if (!validation.ok) {
    if (validation.reason === "not_found") throw new Response("Not Found", { status: 404 });
    return { mode: "unavailable", reason: validation.reason };
  }
  const { link, resume } = validation;

  // Crawlers and obvious scrapers get a contentless page — this also keeps
  // chat-app link preview bots from ever seeing resume pixels.
  const requestAssessment = assessRequest(request);
  if (requestAssessment.suspected) {
    await logServerEvent(null, link.id, "bot_suspected", {
      stage: "page_load",
      reasons: requestAssessment.reasons.join(","),
    });
    return { mode: "unavailable", reason: "bot" };
  }

  const auth = await getAuthorizedSession(request);
  if (auth && auth.link.id === link.id) {
    const pages = await getResumePages(resume.id);
    return {
      mode: "viewer",
      viewer: {
        token: params.token,
        resumeLabel: resume.label,
        recipientLabel: link.recipientLabel,
        pageCount: resume.pageCount,
        pages: pages.map((p) => ({
          pageIndex: p.pageIndex,
          loWidth: p.loWidth,
          loHeight: p.loHeight,
          hiWidth: p.hiWidth,
          hiHeight: p.hiHeight,
        })),
        zones: resume.zones.filter(
          (z) => z.kind === "section" || (link.redacted && z.kind === "redact"),
        ),
        redacted: link.redacted,
        watermarkNotice: `Watermarked for ${link.recipientLabel}`,
      },
    };
  }

  return {
    mode: "gate",
    gate: {
      needsPassword: Boolean(link.passwordHash),
      turnstileSiteKey: env.turnstileSiteKey || null,
      recipientLabel: link.recipientLabel,
    },
  };
}

export async function action({ request, params }: Route.ActionArgs) {
  const ip = clientIp(request);
  if (!rateLimit(`gate:${ip}:${params.token}`, 10, 60_000).allowed) {
    return data({ error: "rate_limited" as GateActionError }, { status: 429 });
  }

  const validation = await validateLink(params.token, { forNewSession: true });
  if (!validation.ok) {
    if (validation.reason === "not_found") throw new Response("Not Found", { status: 404 });
    // Loader will render the specific unavailable screen.
    return redirect(`/r/${params.token}`);
  }
  const { link, resume } = validation;

  const form = await request.formData();

  const turnstileOk = await verifyTurnstile(
    form.get("cf-turnstile-response")?.toString() ?? null,
    ip,
  );
  if (!turnstileOk) {
    await logServerEvent(null, link.id, "gate_failed", { stage: "turnstile" });
    captureServer(`link:${link.id}`, "gate_failed", { stage: "turnstile" });
    return data({ error: "challenge" as GateActionError }, { status: 403 });
  }

  let signals: ClientSignals | null = null;
  try {
    signals = JSON.parse(form.get("signals")?.toString() ?? "null");
  } catch {
    signals = null;
  }
  const requestAssessment = assessRequest(request);
  const signalAssessment = assessClientSignals(signals);
  if (signals?.webdriver === true || requestAssessment.reasons.includes("isbot_match")) {
    await logServerEvent(null, link.id, "bot_suspected", {
      stage: "gate_submit",
      reasons: [...requestAssessment.reasons, ...signalAssessment.reasons].join(","),
    });
    return data({ error: "blocked" as GateActionError }, { status: 403 });
  }

  if (link.passwordHash) {
    const ok = await verifyLinkPassword(link, form.get("password")?.toString() ?? "");
    if (!ok) {
      await logServerEvent(null, link.id, "gate_failed", { stage: "password" });
      return data({ error: "password" as GateActionError }, { status: 401 });
    }
  }

  const rawFingerprint = form.get("fingerprint")?.toString() ?? "";
  const fingerprint = /^[a-f0-9]{16,64}$/.test(rawFingerprint) ? rawFingerprint : "unknown";

  const { cookieHeader } = await startSession(request, link, resume.label, {
    fingerprint,
    suspectedBot: requestAssessment.suspected || signalAssessment.suspected,
  });

  return redirect(`/r/${params.token}`, { headers: { "Set-Cookie": cookieHeader } });
}

export default function ViewerRoute({ loaderData, actionData }: Route.ComponentProps) {
  if (loaderData.mode === "unavailable") {
    return <UnavailableScreen reason={loaderData.reason} />;
  }
  if (loaderData.mode === "gate") {
    return <GateScreen gate={loaderData.gate} error={actionData?.error ?? null} />;
  }
  return <ViewerScreen viewer={loaderData.viewer} />;
}

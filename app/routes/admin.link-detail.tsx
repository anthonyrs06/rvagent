import { Link, data } from "react-router";

import { CopyButton } from "~/components/admin/copy-button";
import {
  formatDateTime,
  formatDuration,
  formatExpiry,
  formatTime,
  timeAgo,
} from "~/components/admin/format";
import { useAutoRevalidate, useOrigin } from "~/components/admin/hooks";
import { LinkStatusActions } from "~/components/admin/link-actions";
import {
  BotBadge,
  EmptyState,
  EngagementChip,
  LinkStatusChip,
  LiveBadge,
  SecurityTypeChip,
  StatCard,
} from "~/components/admin/ui";
import { requireAdmin } from "~/lib/auth.server";
import {
  aggregatePageDwell,
  aggregateSectionDwell,
  getEventsForSession,
  getSecurityEventsForLink,
  summarizeSession,
} from "~/lib/events.server";
import { getLink, setLinkStatus } from "~/lib/links.server";
import { getResume, getResumePages } from "~/lib/resumes.server";
import { getSessionsForLink } from "~/lib/sessions.server";
import type { Route } from "./+types/admin.link-detail";

const LIVE_WINDOW_MS = 30_000;
const MAX_EVENTS_PER_SESSION = 200;

export function meta({ loaderData }: Route.MetaArgs) {
  return [
    {
      title: loaderData
        ? `${loaderData.link.recipientLabel} · Resume Vault`
        : "Link · Resume Vault",
    },
  ];
}

export async function loader({ request, params }: Route.LoaderArgs) {
  await requireAdmin(request);

  const link = await getLink(params.linkId);
  if (!link) throw new Response("Not Found", { status: 404 });
  const resume = await getResume(link.resumeId);
  if (!resume) throw new Response("Not Found", { status: 404 });

  const [pages, sessionRows, securityEvents, sectionDwell, pageDwell] = await Promise.all([
    getResumePages(resume.id),
    getSessionsForLink(link.id),
    getSecurityEventsForLink(link.id),
    aggregateSectionDwell(link.id),
    aggregatePageDwell(link.id),
  ]);

  // Fine at personal scale: a handful of sessions, two queries per session.
  const [summaries, eventLists] = await Promise.all([
    Promise.all(sessionRows.map((s) => summarizeSession(s, link, resume.pageCount, resume.zones))),
    Promise.all(sessionRows.map((s) => getEventsForSession(s.id))),
  ]);

  const sessions = sessionRows
    .map((session, i) => ({
      session,
      summary: summaries[i],
      // Newest-first raw feed, capped to the most recent events.
      events: eventLists[i]
        .slice(-MAX_EVENTS_PER_SESSION)
        .reverse()
        .map((e) => ({
          id: e.id,
          type: e.type,
          pageIndex: e.pageIndex,
          zoneId: e.zoneId,
          value: e.value,
          createdAt: e.createdAt,
        })),
      totalEvents: eventLists[i].length,
    }))
    .reverse();

  return {
    link,
    resume,
    pages: pages.map((p) => ({ pageIndex: p.pageIndex, loWidth: p.loWidth, loHeight: p.loHeight })),
    sessions,
    securityEvents: [...securityEvents].reverse(),
    sectionDwell,
    pageDwell,
    now: Date.now(),
  };
}

export async function action({ request, params }: Route.ActionArgs) {
  await requireAdmin(request);
  const link = await getLink(params.linkId);
  if (!link) throw new Response("Not Found", { status: 404 });

  const form = await request.formData();
  switch (form.get("intent")?.toString()) {
    case "pause":
      await setLinkStatus(link.id, "paused");
      return { ok: true as const };
    case "activate":
      await setLinkStatus(link.id, "active");
      return { ok: true as const };
    case "revoke":
      await setLinkStatus(link.id, "revoked");
      return { ok: true as const };
    default:
      return data({ error: "Unknown action." }, { status: 400 });
  }
}

/** Green→amber→red ramp by share of the busiest section; gray dashed when unseen. */
function attentionTone(dwellMs: number, maxDwellMs: number): string {
  if (dwellMs <= 0) return "border-2 border-dashed border-gray-500/60 bg-transparent";
  const share = dwellMs / Math.max(1, maxDwellMs);
  if (share <= 0.33) return "border-2 border-emerald-500/70 bg-emerald-500/40";
  if (share <= 0.66) return "border-2 border-amber-500/70 bg-amber-500/40";
  return "border-2 border-red-500/70 bg-red-500/40";
}

function eventValue(type: string, value: number | null): string {
  if (value === null) return "—";
  if (type.includes("dwell")) return formatDuration(value);
  if (type === "zoom") return `${value.toFixed(2)}×`;
  return String(value);
}

export default function AdminLinkDetail({ loaderData }: Route.ComponentProps) {
  const { link, resume, pages, sessions, securityEvents, sectionDwell, pageDwell, now } =
    loaderData;
  const origin = useOrigin();
  useAutoRevalidate(10_000);

  const shareUrl = `${origin}/r/${link.token}`;
  const zoneLabelById = new Map(resume.zones.map((z) => [z.id, z.label]));
  const sectionZones = resume.zones.filter((z) => z.kind === "section");
  const maxZoneDwell = Math.max(0, ...sectionZones.map((z) => sectionDwell[z.id] ?? 0));
  const totalSectionDwell = sectionZones.reduce((sum, z) => sum + (sectionDwell[z.id] ?? 0), 0);

  const totalActiveMs = sessions.reduce((sum, s) => sum + s.summary.activeMs, 0);
  const uniqueDevices = new Set(sessions.map((s) => s.session.fingerprint)).size;
  const bestScore = sessions.length
    ? Math.max(...sessions.map((s) => s.summary.score))
    : null;
  const liveCount = sessions.filter(
    (s) => !s.session.endedAt && now - s.session.lastSeenAt.getTime() <= LIVE_WINDOW_MS,
  ).length;

  const maxPageDwell = Math.max(1, ...Array.from({ length: resume.pageCount }, (_, i) => pageDwell[i] ?? 0));

  const expiry = formatExpiry(link.expiresAt, now);
  const config = [
    link.expiresAt === null ? "no expiry" : expiry === "expired" ? "expired" : `expires ${expiry}`,
    link.passwordHash ? "password" : null,
    link.maxViews !== null ? `max ${link.maxViews} views` : null,
    link.oneTime ? "one-time" : null,
    link.redacted ? "redacted" : null,
    link.autoLockOnForward ? "auto-lock on forward" : null,
    `${link.openCount} ${link.openCount === 1 ? "open" : "opens"}`,
  ].filter((part): part is string => part !== null);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <Link to="/admin/links" className="text-xs text-gray-500 transition hover:text-white">
          ← All links
        </Link>
        <div className="mt-1 flex flex-wrap items-center gap-3">
          <h1 className="text-lg font-semibold text-white">{link.recipientLabel}</h1>
          <LinkStatusChip status={link.status} />
          {liveCount > 0 && <LiveBadge />}
          <div className="ml-auto flex items-center gap-1.5">
            <LinkStatusActions linkId={link.id} status={link.status} />
          </div>
        </div>
        {link.note && <p className="mt-1 text-xs text-gray-500">{link.note}</p>}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <code className="min-w-0 break-all rounded-lg border border-gray-800 bg-gray-900 px-2.5 py-1.5 text-xs text-gray-300">
            {shareUrl}
          </code>
          <CopyButton text={shareUrl} label="Copy URL" />
        </div>
        <p className="mt-2 text-xs text-gray-500">
          {resume.label} · {config.join(" · ")}
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Sessions" value={sessions.length} />
        <StatCard label="Unique devices" value={uniqueDevices} />
        <StatCard label="Active reading time" value={formatDuration(totalActiveMs)} />
        <StatCard label="Best engagement" value={bestScore === null ? "–" : Math.round(bestScore)} />
      </div>

      {/* Attention map */}
      <section className="rounded-2xl border border-gray-800 bg-gray-900 p-5">
        <h2 className="text-sm font-semibold text-white">Attention map</h2>
        <p className="mt-1 text-xs text-gray-500">
          Section tint shows aggregate dwell across all sessions of this link — green is light
          attention relative to the busiest section, red is where they lingered.
        </p>

        {sectionZones.length === 0 && (
          <div className="mt-4 rounded-xl border border-dashed border-gray-800 px-4 py-6 text-center text-sm text-gray-500">
            No sections defined for this resume yet.{" "}
            <Link
              to={`/admin/resumes/${resume.id}`}
              className="text-emerald-400 hover:underline"
            >
              Open the zone editor
            </Link>{" "}
            to name regions like "Experience" and unlock per-section attention analytics.
          </div>
        )}

        <div className="mx-auto mt-5 w-full max-w-[700px] space-y-8">
          {pages.map((p) => (
            <div key={p.pageIndex}>
              <div
                className="relative overflow-hidden rounded-lg border border-gray-800"
                style={{ aspectRatio: `${p.loWidth} / ${p.loHeight}` }}
              >
                <img
                  src={`/api/admin/resumes/${resume.id}/page/${p.pageIndex}?tier=lo`}
                  alt={`Page ${p.pageIndex + 1}`}
                  draggable={false}
                  className="w-full select-none"
                />
                {sectionZones
                  .filter((z) => z.pageIndex === p.pageIndex)
                  .map((z) => {
                    const dwell = sectionDwell[z.id] ?? 0;
                    const pct =
                      totalSectionDwell > 0 ? Math.round((dwell / totalSectionDwell) * 100) : 0;
                    return (
                      <div
                        key={z.id}
                        className={`absolute ${attentionTone(dwell, maxZoneDwell)}`}
                        style={{
                          left: `${z.x * 100}%`,
                          top: `${z.y * 100}%`,
                          width: `${z.w * 100}%`,
                          height: `${z.h * 100}%`,
                        }}
                        title={`${z.label}: ${formatDuration(dwell)} (${pct}% of section attention)`}
                      >
                        <span className="absolute left-1 top-1 max-w-full truncate rounded bg-gray-950/85 px-1.5 py-0.5 text-[10px] font-medium text-white">
                          {z.label} — {Math.round(dwell / 1000)}s · {pct}%
                        </span>
                      </div>
                    );
                  })}
              </div>
              <p className="mt-2 text-center text-xs text-gray-600">Page {p.pageIndex + 1}</p>
            </div>
          ))}
        </div>

        <h3 className="mt-8 text-xs font-semibold uppercase tracking-wide text-gray-500">
          Page attention (drop-off)
        </h3>
        <div className="mt-3 space-y-2">
          {Array.from({ length: resume.pageCount }, (_, i) => {
            const dwell = pageDwell[i] ?? 0;
            return (
              <div key={i} className="flex items-center gap-3 text-xs">
                <span className="w-14 shrink-0 text-gray-400">Page {i + 1}</span>
                <div className="h-4 flex-1 overflow-hidden rounded bg-gray-800/60">
                  <div
                    className="h-full rounded bg-emerald-600/70"
                    style={{ width: `${(dwell / maxPageDwell) * 100}%` }}
                  />
                </div>
                <span className="w-16 shrink-0 text-right text-gray-500">
                  {formatDuration(dwell)}
                </span>
              </div>
            );
          })}
        </div>
      </section>

      {/* Sessions timeline */}
      <section className="space-y-4">
        <h2 className="text-sm font-semibold text-white">
          Sessions <span className="font-normal text-gray-500">({sessions.length})</span>
        </h2>
        {sessions.length === 0 ? (
          <EmptyState>No sessions yet — this link has not been opened.</EmptyState>
        ) : (
          sessions.map(({ session, summary, events, totalEvents }) => {
            const live =
              !session.endedAt && now - session.lastSeenAt.getTime() <= LIVE_WINDOW_MS;
            const durationMs =
              (session.endedAt ?? session.lastSeenAt).getTime() - session.startedAt.getTime();
            const pagesSeen = summary.pagesSeen.map((p) => p + 1).join(" · ");
            return (
              <article
                key={session.id}
                className="rounded-2xl border border-gray-800 bg-gray-900 p-5"
              >
                <header className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium text-white">
                    {formatDateTime(session.startedAt)}
                  </span>
                  <span className="text-xs text-gray-500">({timeAgo(session.startedAt, now)})</span>
                  {live && <LiveBadge />}
                  {session.suspectedBot && <BotBadge />}
                  <EngagementChip score={summary.score} />
                  <span className="ml-auto text-xs text-gray-500">
                    {session.deviceLabel ?? "Unknown device"}
                  </span>
                </header>

                <dl className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                  <div>
                    <dt className="text-xs text-gray-500">Duration</dt>
                    <dd className="mt-0.5 text-gray-200">{formatDuration(durationMs)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-gray-500">Pages seen</dt>
                    <dd className="mt-0.5 text-gray-200">
                      {pagesSeen ? `${pagesSeen} of ${resume.pageCount}` : "—"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-gray-500">Reveals</dt>
                    <dd className="mt-0.5 text-gray-200">{summary.reveals}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-gray-500">Zooms</dt>
                    <dd className="mt-0.5 text-gray-200">{summary.zooms}</dd>
                  </div>
                </dl>

                <details className="mt-4">
                  <summary className="cursor-pointer text-xs text-gray-500 transition hover:text-white">
                    Raw events ({events.length}
                    {totalEvents > events.length ? ` of ${totalEvents}, latest shown` : ""})
                  </summary>
                  {events.length === 0 ? (
                    <p className="mt-2 text-xs text-gray-600">No events recorded.</p>
                  ) : (
                    <div className="mt-2 max-h-80 overflow-y-auto rounded-lg border border-gray-800">
                      <table className="w-full text-xs">
                        <thead className="sticky top-0 bg-gray-900">
                          <tr className="border-b border-gray-800 text-left text-[10px] uppercase tracking-wide text-gray-500">
                            <th className="px-3 py-2 font-medium">Type</th>
                            <th className="px-3 py-2 font-medium">Page</th>
                            <th className="px-3 py-2 font-medium">Zone</th>
                            <th className="px-3 py-2 font-medium">Value</th>
                            <th className="px-3 py-2 font-medium">Time</th>
                          </tr>
                        </thead>
                        <tbody>
                          {events.map((e) => (
                            <tr key={e.id} className="border-b border-gray-800/50">
                              <td className="px-3 py-1.5 font-mono text-gray-300">{e.type}</td>
                              <td className="px-3 py-1.5 text-gray-400">
                                {e.pageIndex !== null ? e.pageIndex + 1 : "—"}
                              </td>
                              <td className="px-3 py-1.5 text-gray-400">
                                {e.zoneId ? zoneLabelById.get(e.zoneId) ?? e.zoneId : "—"}
                              </td>
                              <td className="px-3 py-1.5 text-gray-400">
                                {eventValue(e.type, e.value)}
                              </td>
                              <td
                                className="px-3 py-1.5 text-gray-500"
                                title={formatDateTime(e.createdAt)}
                              >
                                {formatTime(e.createdAt)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </details>
              </article>
            );
          })
        )}
      </section>

      {/* Security events */}
      <section className="rounded-2xl border border-gray-800 bg-gray-900 p-5">
        <h2 className="text-sm font-semibold text-white">Security events</h2>
        {securityEvents.length === 0 ? (
          <div className="mt-4">
            <EmptyState>No security events for this link.</EmptyState>
          </div>
        ) : (
          <ul className="mt-3 space-y-2.5">
            {securityEvents.map((e) => (
              <li key={e.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                <SecurityTypeChip type={e.type} />
                {e.meta && (
                  <code className="min-w-0 break-all text-[10px] text-gray-600">
                    {JSON.stringify(e.meta)}
                  </code>
                )}
                <span
                  className="ml-auto shrink-0 text-xs text-gray-600"
                  title={formatDateTime(e.createdAt)}
                >
                  {timeAgo(e.createdAt, now)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

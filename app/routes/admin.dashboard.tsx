import { Link, useNavigate } from "react-router";

import { formatDateTime, formatDuration, timeAgo } from "~/components/admin/format";
import { useAutoRevalidate } from "~/components/admin/hooks";
import {
  BotBadge,
  EmptyState,
  EngagementChip,
  LiveBadge,
  SecurityTypeChip,
  StatCard,
} from "~/components/admin/ui";
import { requireAdmin } from "~/lib/auth.server";
import {
  getDashboardStats,
  getOpensSeries,
  getRecentSecurityEvents,
  getRecentSessions,
  type OpensSeriesPoint,
} from "~/lib/dashboard.server";
import type { Route } from "./+types/admin.dashboard";

export function meta(_: Route.MetaArgs) {
  return [{ title: "Dashboard · Resume Vault" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  await requireAdmin(request);
  const [stats, recentSessions, securityEvents, opensSeries] = await Promise.all([
    getDashboardStats(),
    getRecentSessions(12),
    getRecentSecurityEvents(10),
    getOpensSeries(),
  ]);
  return { stats, recentSessions, securityEvents, opensSeries, now: Date.now() };
}

/** "2026-07-06" → "Jul 6" without timezone drift. */
function formatChartDay(day: string): string {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1)).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

function OpensChart({
  points,
  source,
}: {
  points: OpensSeriesPoint[];
  source: "posthog" | "first-party";
}) {
  const max = Math.max(1, ...points.map((p) => p.opens));
  const total = points.reduce((sum, p) => sum + p.opens, 0);
  return (
    <section className="rounded-2xl border border-gray-800 bg-gray-900 p-5">
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="text-sm font-semibold text-white">Opens — last 30 days</h2>
        <p className="text-xs text-gray-500">
          {total} total
          <span className="ml-2 text-[11px] text-gray-600">
            {source === "posthog" ? "via PostHog" : "first-party"}
          </span>
        </p>
      </div>
      <div className="mt-4 flex h-28 items-end gap-[3px]">
        {points.map((p) => (
          <div
            key={p.day}
            title={`${formatChartDay(p.day)} — ${p.opens} ${p.opens === 1 ? "open" : "opens"}`}
            className="flex h-full flex-1 items-end"
          >
            {p.opens > 0 ? (
              <div
                className="w-full rounded-sm bg-emerald-600/80 transition hover:bg-emerald-500"
                style={{ height: `${Math.max(4, (p.opens / max) * 100)}%` }}
              />
            ) : (
              <div className="h-[3px] w-full rounded-sm bg-gray-800" />
            )}
          </div>
        ))}
      </div>
      <div className="mt-2 flex justify-between text-[10px] text-gray-600">
        <span>{points.length > 0 ? formatChartDay(points[0].day) : ""}</span>
        <span>{points.length > 0 ? formatChartDay(points[points.length - 1].day) : ""}</span>
      </div>
    </section>
  );
}

export default function AdminDashboard({ loaderData }: Route.ComponentProps) {
  const { stats, recentSessions, securityEvents, opensSeries, now } = loaderData;
  const navigate = useNavigate();
  useAutoRevalidate(10_000);

  return (
    <div className="space-y-6">
      <h1 className="text-lg font-semibold text-white">Dashboard</h1>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Resumes" value={stats.resumeCount} />
        <StatCard label="Active links" value={stats.activeLinkCount} />
        <StatCard label="Sessions today" value={stats.sessionsToday} />
        <StatCard label="Viewing now" value={stats.liveNow} pulse={stats.liveNow > 0} />
      </div>

      <OpensChart points={opensSeries.points} source={opensSeries.source} />

      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <section className="rounded-2xl border border-gray-800 bg-gray-900 p-5">
          <h2 className="text-sm font-semibold text-white">Recent sessions</h2>
          {recentSessions.length === 0 ? (
            <div className="mt-4">
              <EmptyState>
                No sessions yet. Share a <Link to="/admin/links" className="text-emerald-400 hover:underline">link</Link> to
                start tracking.
              </EmptyState>
            </div>
          ) : (
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-800 text-left text-xs uppercase tracking-wide text-gray-500">
                    <th className="py-2 pr-3 font-medium">Recipient</th>
                    <th className="py-2 pr-3 font-medium">Resume</th>
                    <th className="py-2 pr-3 font-medium">Device</th>
                    <th className="py-2 pr-3 font-medium">Started</th>
                    <th className="py-2 pr-3 font-medium">Duration</th>
                    <th className="py-2 font-medium">Engagement</th>
                  </tr>
                </thead>
                <tbody>
                  {recentSessions.map((s) => {
                    const endMs = (s.endedAt ?? s.lastSeenAt).getTime();
                    return (
                      <tr
                        key={s.sessionId}
                        onClick={() => navigate(`/admin/links/${s.linkId}`)}
                        className="cursor-pointer border-b border-gray-800/60 transition hover:bg-gray-800/40"
                      >
                        <td className="py-2.5 pr-3">
                          <span className="flex items-center gap-2">
                            <Link
                              to={`/admin/links/${s.linkId}`}
                              onClick={(e) => e.stopPropagation()}
                              className="font-medium text-white hover:text-emerald-400"
                            >
                              {s.recipientLabel}
                            </Link>
                            {s.live && <LiveBadge />}
                            {s.suspectedBot && <BotBadge />}
                          </span>
                        </td>
                        <td className="py-2.5 pr-3 text-gray-400">{s.resumeLabel}</td>
                        <td className="py-2.5 pr-3 text-gray-400">{s.deviceLabel ?? "Unknown"}</td>
                        <td className="py-2.5 pr-3 text-gray-400" title={formatDateTime(s.startedAt)}>
                          {timeAgo(s.startedAt, now)}
                        </td>
                        <td className="py-2.5 pr-3 text-gray-400">
                          {formatDuration(endMs - s.startedAt.getTime())}
                        </td>
                        <td className="py-2.5">
                          <EngagementChip score={s.engagementScore} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="rounded-2xl border border-gray-800 bg-gray-900 p-5">
          <h2 className="text-sm font-semibold text-white">Security events</h2>
          {securityEvents.length === 0 ? (
            <div className="mt-4">
              <EmptyState>Nothing suspicious so far.</EmptyState>
            </div>
          ) : (
            <ul className="mt-3 space-y-2.5">
              {securityEvents.map((e) => (
                <li key={e.id} className="flex items-center justify-between gap-3 text-sm">
                  <span className="flex min-w-0 items-center gap-2">
                    <SecurityTypeChip type={e.type} />
                    <span className="truncate text-gray-400">{e.recipientLabel ?? "—"}</span>
                  </span>
                  <span
                    className="shrink-0 text-xs text-gray-600"
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
    </div>
  );
}

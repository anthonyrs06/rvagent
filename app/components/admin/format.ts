/**
 * Date/duration formatting helpers shared by the admin pages.
 * The logic-bearing ones take an explicit `now` so they stay deterministic:
 * loaders pass their own `Date.now()` through, which also keeps SSR and
 * hydration output identical.
 */

type DateLike = Date | number;

const toMs = (input: DateLike): number => (typeof input === "number" ? input : input.getTime());

/** Compact relative time: "just now", "12m ago", "3h ago", "5d ago", then an absolute date. */
export function timeAgo(input: DateLike, now: number = Date.now()): string {
  const seconds = Math.round((now - toMs(input)) / 1000);
  if (seconds < 45) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days <= 14) return `${days}d ago`;

  const date = new Date(toMs(input));
  const sameYear = date.getFullYear() === new Date(now).getFullYear();
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    ...(sameYear ? {} : { year: "numeric" }),
  });
}

/** Human duration from milliseconds: "0s", "42s", "4m 12s", "1h 4m". */
export function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms < 1000) return "0s";
  const totalSeconds = Math.floor(ms / 1000);
  if (totalSeconds < 60) return `${totalSeconds}s`;
  const totalMinutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (totalMinutes < 60) return seconds > 0 ? `${totalMinutes}m ${seconds}s` : `${totalMinutes}m`;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
}

/** Link expiry: "never", "expired", "in <1m", "in 20m", "in 5h", "in 3d". */
export function formatExpiry(expiresAt: DateLike | null, now: number = Date.now()): string {
  if (expiresAt === null) return "never";
  const diff = toMs(expiresAt) - now;
  if (diff <= 0) return "expired";
  if (diff < 60_000) return "in <1m";
  if (diff < 3_600_000) return `in ${Math.floor(diff / 60_000)}m`;
  if (diff < 86_400_000) return `in ${Math.floor(diff / 3_600_000)}h`;
  return `in ${Math.floor(diff / 86_400_000)}d`;
}

/** Absolute timestamp for titles/tooltips, e.g. "Jul 6, 12:41 PM". */
export function formatDateTime(input: DateLike): string {
  return new Date(toMs(input)).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/** Time of day with seconds, for dense event lists. */
export function formatTime(input: DateLike): string {
  return new Date(toMs(input)).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  });
}

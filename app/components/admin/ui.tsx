import { engagementTier } from "~/lib/scoring";
import type { LinkStatus, ResumeStatus } from "~/lib/types";

/** Emerald "activity" dot with a ping halo. */
export function PulseDot({ className = "size-2" }: { className?: string }) {
  return (
    <span className={`relative flex ${className}`}>
      <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-75" />
      <span className="relative inline-flex size-full rounded-full bg-emerald-500" />
    </span>
  );
}

export function StatCard({
  label,
  value,
  pulse = false,
}: {
  label: string;
  value: string | number;
  pulse?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-gray-800 bg-gray-900 p-5">
      <p className="text-xs font-medium uppercase tracking-wide text-gray-500">{label}</p>
      <p className="mt-2 flex items-center gap-2.5 text-2xl font-semibold text-white">
        {value}
        {pulse && <PulseDot className="size-2.5" />}
      </p>
    </div>
  );
}

const LINK_STATUS_STYLES: Record<LinkStatus, string> = {
  active: "border-emerald-500/30 bg-emerald-500/10 text-emerald-400",
  paused: "border-amber-500/30 bg-amber-500/10 text-amber-400",
  revoked: "border-gray-700 bg-gray-800/60 text-gray-500 line-through",
  locked: "border-red-500/30 bg-red-500/10 text-red-400",
};

export function LinkStatusChip({ status }: { status: LinkStatus }) {
  return (
    <span
      className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-medium ${LINK_STATUS_STYLES[status]}`}
    >
      {status}
    </span>
  );
}

const RESUME_STATUS_STYLES: Record<ResumeStatus, string> = {
  ready: "border-emerald-500/30 bg-emerald-500/10 text-emerald-400",
  processing: "border-amber-500/30 bg-amber-500/10 text-amber-400",
  failed: "border-red-500/30 bg-red-500/10 text-red-400",
};

export function ResumeStatusChip({ status }: { status: ResumeStatus }) {
  return (
    <span
      className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-medium ${RESUME_STATUS_STYLES[status]}`}
    >
      {status}
    </span>
  );
}

const TIER_STYLES: Record<ReturnType<typeof engagementTier>, string> = {
  hot: "border-emerald-500/30 bg-emerald-500/10 text-emerald-400",
  engaged: "border-sky-500/30 bg-sky-500/10 text-sky-400",
  skimmed: "border-amber-500/30 bg-amber-500/10 text-amber-400",
  cold: "border-gray-700 bg-gray-800/60 text-gray-400",
};

/** Engagement score chip colored by tier. Renders a muted dash when unscored. */
export function EngagementChip({ score }: { score: number | null }) {
  if (score === null) {
    return (
      <span className="inline-flex rounded-full border border-gray-800 bg-gray-900 px-2 py-0.5 text-[11px] text-gray-600">
        –
      </span>
    );
  }
  const tier = engagementTier(score);
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium ${TIER_STYLES[tier]}`}
      title={`Engagement score ${Math.round(score)} / 100`}
    >
      {Math.round(score)}
      <span className="opacity-70">· {tier}</span>
    </span>
  );
}

export function LiveBadge() {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold tracking-wide text-emerald-400">
      <PulseDot className="size-1.5" />
      LIVE
    </span>
  );
}

export function BotBadge() {
  return (
    <span
      className="inline-flex rounded-full border border-gray-700 bg-gray-800/60 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-gray-400"
      title="Automated client suspected (link preview bot, crawler, or headless browser)"
    >
      bot
    </span>
  );
}

const SECURITY_RED: ReadonlySet<string> = new Set(["forward_suspected", "auto_locked"]);

export function SecurityTypeChip({ type }: { type: string }) {
  const tone = SECURITY_RED.has(type)
    ? "border-red-500/30 bg-red-500/10 text-red-400"
    : "border-amber-500/30 bg-amber-500/10 text-amber-400";
  return (
    <span className={`inline-flex rounded border px-1.5 py-0.5 font-mono text-[11px] ${tone}`}>
      {type}
    </span>
  );
}

/** Tiny uppercase badge for link options (password, one-time, redacted…). */
export function FeatureBadge({ children, title }: { children: React.ReactNode; title?: string }) {
  return (
    <span
      title={title}
      className="inline-flex rounded border border-gray-700 bg-gray-800/60 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-gray-400"
    >
      {children}
    </span>
  );
}

export function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-xl border border-dashed border-gray-800 px-4 py-8 text-center text-sm text-gray-500">
      {children}
    </p>
  );
}

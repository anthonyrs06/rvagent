import { useState } from "react";
import { Form, Link, data, useNavigation } from "react-router";

import { CopyButton } from "~/components/admin/copy-button";
import { formatDateTime, formatExpiry } from "~/components/admin/format";
import { useOrigin } from "~/components/admin/hooks";
import { LinkActionButton, LinkStatusActions } from "~/components/admin/link-actions";
import { EmptyState, FeatureBadge, LinkStatusChip, PulseDot } from "~/components/admin/ui";
import { requireAdmin } from "~/lib/auth.server";
import { createLink, deleteLink, listLinksWithStats, setLinkStatus } from "~/lib/links.server";
import { getResume, listResumes } from "~/lib/resumes.server";
import { TTL_PRESETS } from "~/lib/types";
import type { Route } from "./+types/admin.links";

export function meta(_: Route.MetaArgs) {
  return [{ title: "Share links · Resume Vault" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  await requireAdmin(request);
  const url = new URL(request.url);
  const requestedResumeId = url.searchParams.get("resume")?.trim() ?? "";

  const [rows, resumes] = await Promise.all([listLinksWithStats(), listResumes()]);
  const readyResumes = resumes
    .filter((r) => r.status === "ready")
    .map((r) => ({ id: r.id, label: r.label }));
  const preselectedResumeId = readyResumes.some((r) => r.id === requestedResumeId)
    ? requestedResumeId
    : "";

  return { rows, readyResumes, preselectedResumeId, now: Date.now() };
}

export async function action({ request }: Route.ActionArgs) {
  await requireAdmin(request);
  const form = await request.formData();
  const intent = form.get("intent")?.toString();

  if (intent === "create") {
    const resumeId = form.get("resumeId")?.toString() ?? "";
    const recipientLabel = form.get("recipientLabel")?.toString().trim() ?? "";
    const note = form.get("note")?.toString().trim() || undefined;

    if (!resumeId) return data({ error: "Pick a resume to share." }, { status: 400 });
    const resume = await getResume(resumeId);
    if (!resume || resume.status !== "ready") {
      return data({ error: "That resume is not ready to share." }, { status: 400 });
    }
    if (!recipientLabel) {
      return data({ error: "Recipient label is required." }, { status: 400 });
    }

    const ttl = form.get("ttl")?.toString() ?? "7d";
    let ttlMs: number | null;
    if (ttl === "custom") {
      const hours = Number.parseFloat(form.get("customHours")?.toString() ?? "");
      if (!Number.isFinite(hours) || hours <= 0) {
        return data({ error: "Custom expiry must be a positive number of hours." }, { status: 400 });
      }
      ttlMs = hours * 3_600_000;
    } else {
      const preset = TTL_PRESETS.find((p) => p.id === ttl);
      if (!preset) return data({ error: "Pick a valid expiry." }, { status: 400 });
      ttlMs = preset.ms;
    }

    const password = form.get("password")?.toString() ?? "";
    if (password && password.length < 4) {
      return data({ error: "Password must be at least 4 characters." }, { status: 400 });
    }

    const maxViewsRaw = form.get("maxViews")?.toString().trim() ?? "";
    let maxViews: number | null = null;
    if (maxViewsRaw) {
      const parsed = Number.parseInt(maxViewsRaw, 10);
      if (!Number.isInteger(parsed) || parsed <= 0) {
        return data({ error: "Max views must be a positive whole number." }, { status: 400 });
      }
      maxViews = parsed;
    }

    try {
      const link = await createLink({
        resumeId,
        recipientLabel,
        note,
        ttlMs,
        password: password || undefined,
        maxViews,
        oneTime: form.get("oneTime") === "on",
        redacted: form.get("redacted") === "on",
        autoLockOnForward: form.get("autoLockOnForward") === "on",
      });
      return {
        created: { id: link.id, token: link.token, recipientLabel: link.recipientLabel },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not create the link.";
      return data({ error: message }, { status: 400 });
    }
  }

  const linkId = form.get("linkId")?.toString() ?? "";
  if (!linkId) return data({ error: "Missing link id." }, { status: 400 });

  switch (intent) {
    case "pause":
      await setLinkStatus(linkId, "paused");
      return { ok: true as const };
    case "activate":
      await setLinkStatus(linkId, "active");
      return { ok: true as const };
    case "revoke":
      await setLinkStatus(linkId, "revoked");
      return { ok: true as const };
    case "delete":
      await deleteLink(linkId);
      return { ok: true as const };
    default:
      return data({ error: "Unknown action." }, { status: 400 });
  }
}

const inputClass =
  "mt-1 block w-full rounded-lg border border-gray-700 bg-gray-950 px-3 py-2 text-sm text-white outline-none placeholder:text-gray-600 focus:border-emerald-500";
const labelClass = "block text-xs text-gray-400";

export default function AdminLinks({ loaderData, actionData }: Route.ComponentProps) {
  const { rows, readyResumes, preselectedResumeId, now } = loaderData;
  const origin = useOrigin();
  const navigation = useNavigation();

  const created = actionData && "created" in actionData ? actionData.created : null;
  const error = actionData && "error" in actionData ? actionData.error : null;
  const creating =
    navigation.state !== "idle" && navigation.formData?.get("intent") === "create";

  const [createOpen, setCreateOpen] = useState(
    () => Boolean(preselectedResumeId) || rows.length === 0,
  );
  const [ttlChoice, setTtlChoice] = useState("7d");

  const shareUrl = (token: string) => `${origin}/r/${token}`;

  return (
    <div className="space-y-6">
      <h1 className="text-lg font-semibold text-white">Share links</h1>

      {created && (
        <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3">
          <p className="text-sm text-emerald-300">
            Link for <span className="font-medium">{created.recipientLabel}</span> is ready.
          </p>
          <code className="min-w-0 break-all rounded bg-gray-950/60 px-2 py-1 text-xs text-emerald-200">
            {shareUrl(created.token)}
          </code>
          <CopyButton
            text={shareUrl(created.token)}
            label="Copy link"
            className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-emerald-500"
          />
        </div>
      )}

      <section className="rounded-2xl border border-gray-800 bg-gray-900">
        <button
          type="button"
          onClick={() => setCreateOpen((open) => !open)}
          aria-expanded={createOpen}
          className="flex w-full items-center justify-between px-5 py-4 text-left"
        >
          <span className="text-sm font-semibold text-white">New share link</span>
          <span className="text-xs text-gray-500">{createOpen ? "Hide" : "Show"}</span>
        </button>

        {createOpen && (
          <Form key={created?.id ?? "create"} method="post" className="border-t border-gray-800 p-5">
            <input type="hidden" name="intent" value="create" />
            <div className="grid gap-4 sm:grid-cols-2">
              <label className={labelClass}>
                Resume
                <select name="resumeId" required defaultValue={preselectedResumeId} className={inputClass}>
                  <option value="" disabled>
                    Pick a resume…
                  </option>
                  {readyResumes.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className={labelClass}>
                Recipient label (shown in watermark)
                <input
                  type="text"
                  name="recipientLabel"
                  required
                  placeholder="e.g. Acme — Jane Recruiter"
                  className={inputClass}
                />
              </label>

              <label className={`${labelClass} sm:col-span-2`}>
                Note (only you see this)
                <input
                  type="text"
                  name="note"
                  placeholder="e.g. Applied via referral, follow up Friday"
                  className={inputClass}
                />
              </label>

              <label className={labelClass}>
                Expiry
                <select
                  name="ttl"
                  value={ttlChoice}
                  onChange={(e) => setTtlChoice(e.target.value)}
                  className={inputClass}
                >
                  {TTL_PRESETS.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label}
                    </option>
                  ))}
                  <option value="custom">Custom…</option>
                </select>
              </label>

              {ttlChoice === "custom" && (
                <label className={labelClass}>
                  Custom expiry (hours)
                  <input
                    type="number"
                    name="customHours"
                    min="0.1"
                    step="any"
                    required
                    placeholder="e.g. 48"
                    className={inputClass}
                  />
                </label>
              )}

              <label className={labelClass}>
                Password (optional, min 4 chars)
                <input
                  type="text"
                  name="password"
                  minLength={4}
                  autoComplete="off"
                  placeholder="Leave empty for no password"
                  className={inputClass}
                />
              </label>

              <label className={labelClass}>
                Max views (optional)
                <input
                  type="number"
                  name="maxViews"
                  min="1"
                  step="1"
                  placeholder="Unlimited"
                  className={inputClass}
                />
              </label>

              <div className="flex flex-wrap items-center gap-x-5 gap-y-2 sm:col-span-2">
                <label className="flex cursor-pointer items-center gap-2 text-xs text-gray-400">
                  <input type="checkbox" name="oneTime" className="size-3.5 accent-emerald-500" />
                  One-time (burns after the first open)
                </label>
                <label className="flex cursor-pointer items-center gap-2 text-xs text-gray-400">
                  <input type="checkbox" name="redacted" className="size-3.5 accent-emerald-500" />
                  Redacted (mask redaction zones)
                </label>
                <label className="flex cursor-pointer items-center gap-2 text-xs text-gray-400">
                  <input
                    type="checkbox"
                    name="autoLockOnForward"
                    className="size-3.5 accent-emerald-500"
                  />
                  Auto-lock if forwarding is suspected
                </label>
              </div>
            </div>

            {error && <p className="mt-4 text-sm text-red-400">{error}</p>}

            <button
              type="submit"
              disabled={creating}
              className="mt-4 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {creating ? "Creating…" : "Create link"}
            </button>
          </Form>
        )}
      </section>

      {rows.length === 0 ? (
        <EmptyState>No share links yet — create one above.</EmptyState>
      ) : (
        <section className="overflow-x-auto rounded-2xl border border-gray-800 bg-gray-900">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800 text-left text-xs uppercase tracking-wide text-gray-500">
                <th className="px-4 py-3 font-medium">Recipient</th>
                <th className="px-3 py-3 font-medium">Resume</th>
                <th className="px-3 py-3 font-medium">Status</th>
                <th className="px-3 py-3 font-medium">Options</th>
                <th className="px-3 py-3 font-medium">Opens</th>
                <th className="px-3 py-3 font-medium">Sessions</th>
                <th className="px-3 py-3 font-medium">Expires</th>
                <th className="px-4 py-3 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ link, resumeLabel, sessionCount, liveCount }) => (
                <tr
                  key={link.id}
                  className={`border-b border-gray-800/60 align-middle ${
                    created?.id === link.id ? "bg-emerald-500/5" : ""
                  }`}
                >
                  <td className="px-4 py-3">
                    <span className="flex items-center gap-2">
                      {liveCount > 0 && (
                        <span title={`${liveCount} viewing now`}>
                          <PulseDot />
                        </span>
                      )}
                      <Link
                        to={`/admin/links/${link.id}`}
                        title={link.note ?? undefined}
                        className={`font-medium text-white hover:text-emerald-400 ${
                          link.note ? "underline decoration-gray-600 decoration-dotted underline-offset-4" : ""
                        }`}
                      >
                        {link.recipientLabel}
                      </Link>
                    </span>
                  </td>
                  <td className="px-3 py-3 text-gray-400">{resumeLabel}</td>
                  <td className="px-3 py-3">
                    <LinkStatusChip status={link.status} />
                  </td>
                  <td className="px-3 py-3">
                    <span className="flex flex-wrap gap-1">
                      {link.passwordHash && <FeatureBadge title="Password protected">password</FeatureBadge>}
                      {link.oneTime && <FeatureBadge title="Burns after the first open">one-time</FeatureBadge>}
                      {link.redacted && <FeatureBadge title="Redaction zones are masked">redacted</FeatureBadge>}
                      {link.autoLockOnForward && (
                        <FeatureBadge title="Auto-locks when forwarding is suspected">auto-lock</FeatureBadge>
                      )}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-gray-400">
                    {link.openCount}
                    {link.maxViews !== null && ` / ${link.maxViews}`}
                  </td>
                  <td className="px-3 py-3 text-gray-400">{sessionCount}</td>
                  <td
                    className="px-3 py-3 text-gray-400"
                    title={link.expiresAt ? formatDateTime(link.expiresAt) : "No expiry"}
                  >
                    {formatExpiry(link.expiresAt, now)}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap items-center justify-end gap-1.5">
                      <CopyButton text={shareUrl(link.token)} label="Copy URL" />
                      <Link
                        to={`/admin/links/${link.id}`}
                        className="rounded-lg border border-gray-700 px-2.5 py-1 text-xs text-gray-300 transition hover:border-gray-500 hover:text-white"
                      >
                        Detail
                      </Link>
                      <LinkStatusActions linkId={link.id} status={link.status} />
                      <LinkActionButton
                        linkId={link.id}
                        intent="delete"
                        tone="danger"
                        confirmText="Delete this link and all of its sessions and analytics? This cannot be undone."
                      >
                        Delete
                      </LinkActionButton>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}

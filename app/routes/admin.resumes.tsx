import { Form, Link, data, useNavigation } from "react-router";

import { formatDateTime, timeAgo } from "~/components/admin/format";
import { EmptyState, ResumeStatusChip } from "~/components/admin/ui";
import { requireAdmin } from "~/lib/auth.server";
import { createResume, deleteResume, listResumes } from "~/lib/resumes.server";
import type { Route } from "./+types/admin.resumes";

const MAX_PDF_BYTES = 15 * 1024 * 1024;

export function meta(_: Route.MetaArgs) {
  return [{ title: "Resumes · Resume Vault" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  await requireAdmin(request);
  const resumes = await listResumes();
  return { resumes, now: Date.now() };
}

export async function action({ request }: Route.ActionArgs) {
  await requireAdmin(request);
  const form = await request.formData();
  const intent = form.get("intent")?.toString();

  if (intent === "upload") {
    const file = form.get("pdf");
    if (!(file instanceof File) || file.size === 0) {
      return data({ error: "Choose a PDF file to upload." }, { status: 400 });
    }
    if (file.size > MAX_PDF_BYTES) {
      return data({ error: "PDF is too large — the limit is 15 MB." }, { status: 400 });
    }
    if (!file.type.includes("pdf")) {
      return data({ error: "That file does not look like a PDF." }, { status: 400 });
    }

    const label =
      form.get("label")?.toString().trim() ||
      file.name.replace(/\.pdf$/i, "").trim() ||
      "Untitled resume";

    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      await createResume(label.slice(0, 120), bytes);
      return { ok: true as const };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Upload failed.";
      return data({ error: message }, { status: 400 });
    }
  }

  if (intent === "delete") {
    const resumeId = form.get("resumeId")?.toString();
    if (!resumeId) {
      return data({ error: "Missing resume id." }, { status: 400 });
    }
    await deleteResume(resumeId);
    return { ok: true as const };
  }

  return data({ error: "Unknown action." }, { status: 400 });
}

export default function AdminResumes({ loaderData, actionData }: Route.ComponentProps) {
  const { resumes, now } = loaderData;
  const navigation = useNavigation();
  const uploading =
    navigation.state !== "idle" && navigation.formData?.get("intent") === "upload";
  const error = actionData && "error" in actionData ? actionData.error : null;

  return (
    <div className="space-y-6">
      <h1 className="text-lg font-semibold text-white">Resumes</h1>

      <section className="rounded-2xl border border-gray-800 bg-gray-900 p-5">
        <h2 className="text-sm font-semibold text-white">Upload a resume</h2>
        <p className="mt-1 text-xs text-gray-500">
          The PDF is stored privately and rasterized into per-page images — the original file is
          never served to viewers.
        </p>
        <Form
          method="post"
          encType="multipart/form-data"
          className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end"
        >
          <input type="hidden" name="intent" value="upload" />
          <label className="flex-1 text-xs text-gray-400">
            PDF file (max 15 MB)
            <input
              type="file"
              name="pdf"
              accept="application/pdf"
              required
              className="mt-1 block w-full rounded-lg border border-gray-700 bg-gray-950 px-3 py-2 text-sm text-gray-300 file:mr-3 file:rounded-md file:border-0 file:bg-gray-800 file:px-3 file:py-1 file:text-xs file:text-gray-200"
            />
          </label>
          <label className="flex-1 text-xs text-gray-400">
            Label
            <input
              type="text"
              name="label"
              placeholder="e.g. General 2026 (defaults to file name)"
              className="mt-1 block w-full rounded-lg border border-gray-700 bg-gray-950 px-3 py-2 text-sm text-white outline-none placeholder:text-gray-600 focus:border-emerald-500"
            />
          </label>
          <button
            type="submit"
            disabled={uploading}
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {uploading ? "Uploading & rasterizing…" : "Upload"}
          </button>
        </Form>
        {error && <p className="mt-3 text-sm text-red-400">{error}</p>}
      </section>

      {resumes.length === 0 ? (
        <EmptyState>No resumes yet — upload a PDF above to get started.</EmptyState>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2">
          {resumes.map((resume) => {
            const redactions = resume.zones.filter((z) => z.kind === "redact").length;
            const sections = resume.zones.filter((z) => z.kind === "section").length;
            return (
              <li
                key={resume.id}
                className="flex flex-col gap-3 rounded-2xl border border-gray-800 bg-gray-900 p-5"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-white">{resume.label}</p>
                    <p className="mt-1 text-xs text-gray-500">
                      {resume.pageCount} {resume.pageCount === 1 ? "page" : "pages"}
                      {" · "}
                      {redactions} {redactions === 1 ? "redaction" : "redactions"}
                      {" · "}
                      {sections} {sections === 1 ? "section" : "sections"}
                      {" · "}
                      <span title={formatDateTime(resume.createdAt)}>
                        added {timeAgo(resume.createdAt, now)}
                      </span>
                    </p>
                  </div>
                  <ResumeStatusChip status={resume.status} />
                </div>

                {resume.status === "failed" && resume.error && (
                  <p className="rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs text-red-400">
                    {resume.error}
                  </p>
                )}

                <div className="mt-auto flex flex-wrap items-center gap-2">
                  {resume.status === "ready" && (
                    <>
                      <Link
                        to={`/admin/resumes/${resume.id}`}
                        className="rounded-lg border border-gray-700 px-3 py-1.5 text-xs text-gray-300 transition hover:border-gray-500 hover:text-white"
                      >
                        Zones & preview
                      </Link>
                      <Link
                        to={`/admin/links?resume=${resume.id}`}
                        className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-1.5 text-xs text-emerald-400 transition hover:bg-emerald-500/20"
                      >
                        New link
                      </Link>
                    </>
                  )}
                  <Form
                    method="post"
                    className="ml-auto"
                    onSubmit={(e) => {
                      if (
                        !window.confirm(
                          `Delete "${resume.label}"? Its links and analytics are removed too. This cannot be undone.`,
                        )
                      ) {
                        e.preventDefault();
                      }
                    }}
                  >
                    <input type="hidden" name="intent" value="delete" />
                    <input type="hidden" name="resumeId" value={resume.id} />
                    <button
                      type="submit"
                      className="rounded-lg px-3 py-1.5 text-xs text-gray-500 transition hover:text-red-400"
                    >
                      Delete
                    </button>
                  </Form>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

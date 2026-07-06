import { Link, data } from "react-router";

import { ZoneEditor } from "~/components/admin/zone-editor";
import { parseZonesPayload } from "~/components/admin/zone-validation";
import { requireAdmin } from "~/lib/auth.server";
import { getResume, getResumePages, updateResumeZones } from "~/lib/resumes.server";
import type { Route } from "./+types/admin.resume-detail";

export function meta({ loaderData }: Route.MetaArgs) {
  return [
    {
      title: loaderData
        ? `${loaderData.resume.label} — zones · Resume Vault`
        : "Resume · Resume Vault",
    },
  ];
}

export async function loader({ request, params }: Route.LoaderArgs) {
  await requireAdmin(request);
  const resume = await getResume(params.resumeId);
  if (!resume || resume.status !== "ready") {
    throw new Response("Not Found", { status: 404 });
  }
  const pages = await getResumePages(resume.id);
  return {
    resume,
    pages: pages.map((p) => ({
      pageIndex: p.pageIndex,
      loWidth: p.loWidth,
      loHeight: p.loHeight,
    })),
  };
}

export async function action({ request, params }: Route.ActionArgs) {
  await requireAdmin(request);
  const resume = await getResume(params.resumeId);
  if (!resume || resume.status !== "ready") {
    throw new Response("Not Found", { status: 404 });
  }

  const form = await request.formData();
  if (form.get("intent")?.toString() !== "save-zones") {
    return data({ error: "Unknown action." }, { status: 400 });
  }

  const parsed = parseZonesPayload(form.get("zones")?.toString() ?? "", resume.pageCount);
  if (!parsed.ok) {
    return data({ error: parsed.error }, { status: 400 });
  }

  await updateResumeZones(resume.id, parsed.zones);
  return { ok: true as const };
}

export default function AdminResumeDetail({ loaderData, actionData }: Route.ComponentProps) {
  const { resume, pages } = loaderData;
  const serverError = actionData && "error" in actionData ? actionData.error : null;

  return (
    <div className="space-y-6">
      <div>
        <Link to="/admin/resumes" className="text-xs text-gray-500 transition hover:text-white">
          ← All resumes
        </Link>
        <div className="mt-1 flex flex-wrap items-center gap-3">
          <h1 className="text-lg font-semibold text-white">{resume.label}</h1>
          <span className="text-xs text-gray-500">
            {resume.pageCount} {resume.pageCount === 1 ? "page" : "pages"}
          </span>
          <Link
            to={`/admin/links?resume=${resume.id}`}
            className="ml-auto rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-1.5 text-xs text-emerald-400 transition hover:bg-emerald-500/20"
          >
            New link
          </Link>
        </div>
      </div>

      <div className="rounded-2xl border border-gray-800 bg-gray-900/60 px-4 py-3 text-xs leading-relaxed text-gray-400">
        <span className="font-medium text-red-400">Redaction boxes</span> are blacked out for
        links created with redaction turned on; boxes marked revealable show a click-to-reveal
        control to the viewer, and every reveal is logged.{" "}
        <span className="font-medium text-emerald-400">Sections</span> are named regions
        ("Experience", "Skills") that power per-section attention analytics on link detail pages.
      </div>

      <ZoneEditor
        key={resume.id}
        resumeId={resume.id}
        pages={pages}
        initialZones={resume.zones}
        serverError={serverError}
      />
    </div>
  );
}

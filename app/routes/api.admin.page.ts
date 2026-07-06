import { requireAdmin } from "~/lib/auth.server";
import { getResumePage } from "~/lib/resumes.server";
import { storage } from "~/lib/storage.server";
import type { Route } from "./+types/api.admin.page";

/** Clean (un-watermarked) page images for the owner's zone editor/previews. */
export async function loader({ request, params }: Route.LoaderArgs) {
  await requireAdmin(request);

  const pageIndex = Number.parseInt(params.pageIndex ?? "", 10);
  if (!Number.isInteger(pageIndex) || pageIndex < 0) {
    throw new Response("Bad Request", { status: 400 });
  }
  const page = await getResumePage(params.resumeId, pageIndex);
  if (!page) throw new Response("Not Found", { status: 404 });

  const tier = new URL(request.url).searchParams.get("tier") === "hi" ? "hi" : "lo";
  const data = await storage.get(tier === "hi" ? page.hiKey : page.loKey);

  return new Response(new Uint8Array(data), {
    headers: {
      "Content-Type": "image/webp",
      "Cache-Control": "private, no-store",
    },
  });
}

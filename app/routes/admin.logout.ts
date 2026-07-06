import { redirect } from "react-router";

import { destroyAdminCookie } from "~/lib/auth.server";
import type { Route } from "./+types/admin.logout";

export async function action(_: Route.ActionArgs) {
  return redirect("/admin/login", { headers: { "Set-Cookie": await destroyAdminCookie() } });
}

export async function loader() {
  throw redirect("/admin/login");
}

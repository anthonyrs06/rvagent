import { Form, data, redirect } from "react-router";

import {
  adminConfigured,
  createAdminCookie,
  isAdminRequest,
  verifyOwnerPassword,
} from "~/lib/auth.server";
import { clientIp, rateLimit } from "~/lib/rate-limit.server";
import type { Route } from "./+types/admin.login";

export function meta(_: Route.MetaArgs) {
  return [{ title: "Owner sign in · Resume Vault" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  if (await isAdminRequest(request)) throw redirect("/admin");
  return { configured: adminConfigured() };
}

export async function action({ request }: Route.ActionArgs) {
  const ip = clientIp(request);
  if (!rateLimit(`admin-login:${ip}`, 5, 60_000).allowed) {
    return data({ error: "Too many attempts. Wait a minute." }, { status: 429 });
  }
  const form = await request.formData();
  const ok = await verifyOwnerPassword(form.get("password")?.toString() ?? "");
  if (!ok) {
    return data({ error: "Wrong password." }, { status: 401 });
  }
  return redirect("/admin", { headers: { "Set-Cookie": await createAdminCookie() } });
}

export default function AdminLogin({ loaderData, actionData }: Route.ComponentProps) {
  return (
    <main className="flex min-h-svh items-center justify-center bg-gray-950 px-6">
      <div className="w-full max-w-sm rounded-2xl border border-gray-800 bg-gray-900 p-8">
        <h1 className="text-lg font-semibold text-white">Owner sign in</h1>
        {loaderData.configured ? (
          <Form method="post" className="mt-6 space-y-4">
            <input
              type="password"
              name="password"
              required
              autoFocus
              placeholder="Owner password"
              className="w-full rounded-lg border border-gray-700 bg-gray-950 px-3 py-2 text-sm text-white outline-none focus:border-emerald-500"
            />
            {actionData?.error && <p className="text-sm text-red-400">{actionData.error}</p>}
            <button
              type="submit"
              className="w-full rounded-lg bg-emerald-600 py-2 text-sm font-medium text-white transition hover:bg-emerald-500"
            >
              Sign in
            </button>
          </Form>
        ) : (
          <p className="mt-4 text-sm text-amber-400">
            Set <code className="rounded bg-gray-800 px-1">OWNER_PASSWORD</code> in your .env file,
            then restart the server.
          </p>
        )}
      </div>
    </main>
  );
}

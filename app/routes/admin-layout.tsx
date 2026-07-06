import { Form, NavLink, Outlet } from "react-router";

import { requireAdmin } from "~/lib/auth.server";
import type { Route } from "./+types/admin-layout";

export async function loader({ request }: Route.LoaderArgs) {
  await requireAdmin(request);
  return null;
}

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  `rounded-lg px-3 py-1.5 text-sm transition ${
    isActive ? "bg-gray-800 text-white" : "text-gray-400 hover:text-white"
  }`;

export default function AdminLayout() {
  return (
    <div className="min-h-svh bg-gray-950 text-gray-100">
      <header className="sticky top-0 z-20 border-b border-gray-800 bg-gray-950/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-6 px-6 py-3">
          <span className="flex items-center gap-2 text-sm font-semibold tracking-tight text-white">
            <span className="flex size-7 items-center justify-center rounded-lg border border-emerald-500/30 bg-emerald-500/10 text-xs">
              🔐
            </span>
            Resume Vault
          </span>
          <nav className="flex items-center gap-1">
            <NavLink to="/admin" end className={navLinkClass}>
              Dashboard
            </NavLink>
            <NavLink to="/admin/resumes" className={navLinkClass}>
              Resumes
            </NavLink>
            <NavLink to="/admin/links" className={navLinkClass}>
              Links
            </NavLink>
          </nav>
          <Form method="post" action="/admin/logout" className="ml-auto">
            <button
              type="submit"
              className="rounded-lg px-3 py-1.5 text-sm text-gray-500 transition hover:text-white"
            >
              Sign out
            </button>
          </Form>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-8">
        <Outlet />
      </main>
    </div>
  );
}

import { Link } from "react-router";

import type { Route } from "./+types/home";

export function meta(_: Route.MetaArgs) {
  return [
    { title: "Resume Vault" },
    { name: "description", content: "Private resume viewing room" },
  ];
}

export default function Home() {
  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-6 bg-gray-950 px-6 text-center">
      <div className="flex size-14 items-center justify-center rounded-2xl border border-emerald-500/30 bg-emerald-500/10 text-2xl">
        🔐
      </div>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-white">Resume Vault</h1>
        <p className="mt-2 max-w-sm text-sm text-gray-400">
          A private viewing room. If someone shared a resume with you, use the exact link you were
          given.
        </p>
      </div>
      <Link
        to="/admin"
        className="rounded-lg border border-gray-700 px-4 py-2 text-sm text-gray-300 transition hover:border-gray-500 hover:text-white"
      >
        Owner sign in
      </Link>
    </main>
  );
}

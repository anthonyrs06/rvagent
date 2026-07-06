import { hash, verify } from "@node-rs/argon2";
import { createCookie, redirect } from "react-router";

import { env } from "~/lib/env.server";

const adminCookie = createCookie("rv_admin", {
  httpOnly: true,
  sameSite: "lax",
  path: "/",
  secure: env.isProd,
  secrets: [env.sessionSecret],
  maxAge: 60 * 60 * 24 * 7,
});

// Hash the env password once at boot so login compares via argon2.verify
// (constant-time) rather than a string equality.
let ownerHashPromise: Promise<string> | null = null;
function getOwnerHash(): Promise<string> | null {
  if (!env.ownerPassword) return null;
  ownerHashPromise ??= hash(env.ownerPassword);
  return ownerHashPromise;
}

export function adminConfigured(): boolean {
  return env.ownerPassword.length > 0;
}

export async function verifyOwnerPassword(password: string): Promise<boolean> {
  const hashP = getOwnerHash();
  if (!hashP || !password) return false;
  try {
    return await verify(await hashP, password);
  } catch {
    return false;
  }
}

export async function createAdminCookie(): Promise<string> {
  return adminCookie.serialize({ ok: true, iat: Date.now() });
}

export async function destroyAdminCookie(): Promise<string> {
  return adminCookie.serialize("", { maxAge: 0 });
}

export async function isAdminRequest(request: Request): Promise<boolean> {
  const parsed = await adminCookie.parse(request.headers.get("Cookie")).catch(() => null);
  return parsed?.ok === true;
}

/** Loader/action guard for everything under /admin (except /admin/login). */
export async function requireAdmin(request: Request): Promise<void> {
  if (!(await isAdminRequest(request))) {
    throw redirect("/admin/login");
  }
}

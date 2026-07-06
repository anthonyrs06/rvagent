import { mkdirSync } from "node:fs";
import path from "node:path";

import { createClient, type Client } from "@libsql/client";
import { drizzle, type LibSQLDatabase } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";

import { env } from "~/lib/env.server";
import * as schema from "./schema";

export type Db = LibSQLDatabase<typeof schema>;

interface DbHolder {
  db: Db;
  client: Client;
  migrated: Promise<void>;
}

declare global {
  // eslint-disable-next-line no-var
  var __resumeVaultDb: DbHolder | undefined;
}

function create(): DbHolder {
  mkdirSync(env.dataDir, { recursive: true });
  const client = createClient({
    url: `file:${path.join(env.dataDir, "resume-vault.db")}`,
  });
  const db = drizzle(client, { schema });
  const migrated = migrate(db, {
    migrationsFolder: path.resolve("drizzle"),
  }).catch((error) => {
    console.error("[db] migration failed", error);
    throw error;
  });
  return { db, client, migrated };
}

// Cached on globalThis so Vite dev-server HMR doesn't open new connections.
const holder = globalThis.__resumeVaultDb ?? create();
globalThis.__resumeVaultDb = holder;

await holder.migrated;

export const db = holder.db;
export { schema };

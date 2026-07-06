import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./app/db/schema.ts",
  out: "./drizzle",
  dialect: "sqlite",
  dbCredentials: {
    url: `file:${process.env.DATA_DIR ?? "./data"}/resume-vault.db`,
  },
});

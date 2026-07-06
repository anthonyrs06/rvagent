import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("validateProductionEnv", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("does nothing in development", async () => {
    process.env.NODE_ENV = "development";
    process.env.OWNER_PASSWORD = "";
    await expect(import("~/lib/boot.server")).resolves.toBeDefined();
  });

  it("throws in production when OWNER_PASSWORD is missing", async () => {
    process.env.NODE_ENV = "production";
    process.env.SESSION_SECRET = "a".repeat(32);
    process.env.OWNER_PASSWORD = "";
    process.env.POSTHOG_TOKEN = "phc_test";
    process.env.POSTHOG_HOST = "https://us.i.posthog.com";
    process.env.POSTHOG_PERSONAL_API_KEY = "phx_test";
    process.env.POSTHOG_PROJECT_ID = "12345";

    await expect(import("~/lib/boot.server")).rejects.toThrow(/OWNER_PASSWORD/);
  });

  it("throws in production when PostHog is incomplete", async () => {
    process.env.NODE_ENV = "production";
    process.env.SESSION_SECRET = "a".repeat(32);
    process.env.OWNER_PASSWORD = "a".repeat(12);
    process.env.POSTHOG_TOKEN = "";
    process.env.POSTHOG_PERSONAL_API_KEY = "phx_test";
    process.env.POSTHOG_PROJECT_ID = "12345";

    await expect(import("~/lib/boot.server")).rejects.toThrow(/POSTHOG_TOKEN/);
  });

  it("passes in production when required vars are set", async () => {
    process.env.NODE_ENV = "production";
    process.env.SESSION_SECRET = "a".repeat(32);
    process.env.OWNER_PASSWORD = "a".repeat(12);
    process.env.POSTHOG_TOKEN = "phc_test";
    process.env.POSTHOG_HOST = "https://us.i.posthog.com";
    process.env.POSTHOG_PERSONAL_API_KEY = "phx_test";
    process.env.POSTHOG_PROJECT_ID = "12345";

    await expect(import("~/lib/boot.server")).resolves.toBeDefined();
  });
});

import { afterEach, beforeEach, describe, expect, it } from "vitest";

type PosthogExtensions = {
  initSessionRecording?: unknown;
  rrweb?: { record?: unknown };
};

/**
 * Regression: `posthog-js/dist/recorder` only sets rrweb; session replay also
 * needs `initSessionRecording` from `posthog-js/dist/posthog-recorder`.
 */
describe("posthog-recorder side effect", () => {
  beforeEach(() => {
    (globalThis as { window?: typeof globalThis }).window = globalThis;
    (globalThis as { __PosthogExtensions__?: PosthogExtensions }).__PosthogExtensions__ = {};
  });

  afterEach(() => {
    delete (globalThis as { __PosthogExtensions__?: unknown }).__PosthogExtensions__;
    delete (globalThis as { window?: unknown }).window;
  });

  it("registers initSessionRecording on PosthogExtensions", async () => {
    await import("posthog-js/dist/posthog-recorder");
    const ext = (globalThis as { __PosthogExtensions__?: PosthogExtensions }).__PosthogExtensions__;
    expect(ext?.initSessionRecording).toBeTypeOf("function");
    expect(ext?.rrweb?.record).toBeTypeOf("function");
  });
});

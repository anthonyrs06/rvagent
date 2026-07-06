import { describe, expect, it } from "vitest";

import { hashIdentifier, POSTHOG_PRIVACY_CONFIG } from "../posthog-privacy";

describe("hashIdentifier", () => {
  it("produces a deterministic 64-char hex string", async () => {
    const h1 = await hashIdentifier("AbC-123");
    const h2 = await hashIdentifier("AbC-123");
    expect(h1).toBe(h2);
    expect(h1).toMatch(/^[0-9a-f]{64}$/);
  });

  it("normalises separators and case", async () => {
    expect(await hashIdentifier("ABC-123")).toBe(await hashIdentifier("abc 123"));
  });
});

describe("POSTHOG_PRIVACY_CONFIG", () => {
  it("uses identified_only person profiles", () => {
    expect(POSTHOG_PRIVACY_CONFIG.person_profiles).toBe("identified_only");
  });

  it("before_send strips share tokens from every URL property", () => {
    const event = {
      properties: {
        $current_url: "https://vault.example.com/r/secret-token-abc?x=1",
        $pathname: "/r/secret-token-abc",
        $referrer: "https://mail.example.com/r/other-token",
      },
    };
    const result = POSTHOG_PRIVACY_CONFIG.before_send(event);
    expect(JSON.stringify(result)).not.toContain("secret-token-abc");
    expect(result.properties?.$pathname).toBe("/r/[TOKEN]");
  });

  it("passes through events without properties", () => {
    expect(POSTHOG_PRIVACY_CONFIG.before_send(null)).toBeNull();
  });

  it("masks all replay text except explicit data-ph-unmask opt-ins", () => {
    const rec = POSTHOG_PRIVACY_CONFIG.session_recording;
    expect(rec.maskAllInputs).toBe(true);
    expect(rec.maskTextSelector).toBe("*");
    expect(rec.maskTextFn("hello", null)).toBe("*****");
  });
});

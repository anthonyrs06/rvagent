import { describe, expect, it } from "vitest";

import { assessClientSignals, assessRequest } from "../botguard.server";

const req = (ua: string, acceptLanguage: string | null = "en-US") =>
  new Request("https://vault.test/r/token", {
    headers: {
      ...(ua ? { "user-agent": ua } : {}),
      ...(acceptLanguage ? { "accept-language": acceptLanguage } : {}),
    },
  });

const CHROME =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
// Electron-based embedded browsers (Cursor preview, desktop in-app browsers)
// are real humans but isbot() flags them — they must NOT be hard-blocked.
const ELECTRON =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Cursor/1.2.3 Chrome/126.0.0.0 Electron/30.0 Safari/537.36";

describe("assessRequest", () => {
  it("passes a normal desktop browser cleanly", () => {
    const a = assessRequest(req(CHROME));
    expect(a.hardBlock).toBe(false);
    expect(a.suspected).toBe(false);
  });

  it("allows an Electron/embedded browser but flags it as telemetry", () => {
    const a = assessRequest(req(ELECTRON));
    expect(a.hardBlock).toBe(false); // the bug fix: never deny a real human here
    expect(a.suspected).toBe(true);
    expect(a.reasons).toContain("isbot_match");
  });

  it("hard-blocks explicit automation user agents", () => {
    for (const ua of [
      "curl/8.4.0",
      "python-requests/2.31.0",
      "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 HeadlessChrome/126.0 Safari/537.36",
      "Scrapy/2.11 (+https://scrapy.org)",
    ]) {
      expect(assessRequest(req(ua)).hardBlock, ua).toBe(true);
    }
  });

  it("treats a missing user agent as soft, not a hard block", () => {
    const a = assessRequest(req("", null));
    expect(a.hardBlock).toBe(false);
    expect(a.reasons).toContain("missing_user_agent");
  });
});

describe("assessClientSignals", () => {
  const human = { webdriver: false, hardwareConcurrency: 8, languages: 2, plugins: 3 };

  it("passes realistic human signals", () => {
    expect(assessClientSignals(human).hardBlock).toBe(false);
  });

  it("hard-blocks navigator.webdriver === true", () => {
    expect(assessClientSignals({ ...human, webdriver: true }).hardBlock).toBe(true);
  });

  it("hard-blocks a scripted POST with no client signals", () => {
    const a = assessClientSignals(null);
    expect(a.hardBlock).toBe(true);
    expect(a.reasons).toContain("no_client_signals");
  });

  it("keeps zero-language / zero-core as soft telemetry only", () => {
    const a = assessClientSignals({ ...human, languages: 0, hardwareConcurrency: 0 });
    expect(a.hardBlock).toBe(false);
    expect(a.suspected).toBe(true);
  });
});

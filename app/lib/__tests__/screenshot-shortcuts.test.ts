import { describe, expect, it } from "vitest";

import { matchesScreenshotShortcut } from "~/lib/screenshot-shortcuts";

describe("matchesScreenshotShortcut", () => {
  it("detects PrintScreen", () => {
    expect(matchesScreenshotShortcut({ key: "PrintScreen" })).toBe(true);
  });

  it("detects macOS Cmd+Shift+3/4/5", () => {
    expect(matchesScreenshotShortcut({ key: "3", metaKey: true, shiftKey: true })).toBe(true);
    expect(matchesScreenshotShortcut({ key: "4", metaKey: true, shiftKey: true })).toBe(true);
    expect(matchesScreenshotShortcut({ key: "5", metaKey: true, shiftKey: true })).toBe(true);
  });

  it("detects macOS Cmd+Shift+Ctrl+4", () => {
    expect(
      matchesScreenshotShortcut({ key: "4", metaKey: true, shiftKey: true, ctrlKey: true }),
    ).toBe(true);
  });

  it("detects Win+Shift+S", () => {
    expect(matchesScreenshotShortcut({ key: "s", osKey: true, shiftKey: true })).toBe(true);
  });

  it("ignores normal typing", () => {
    expect(matchesScreenshotShortcut({ key: "a" })).toBe(false);
    expect(matchesScreenshotShortcut({ key: "s", metaKey: true })).toBe(false);
  });
});

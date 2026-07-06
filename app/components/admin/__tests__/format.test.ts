import { describe, expect, it } from "vitest";

import { formatDuration, formatExpiry, timeAgo } from "../format";

const NOW = new Date("2026-07-06T12:00:00Z").getTime();

const secondsAgo = (s: number) => NOW - s * 1000;
const minutesAgo = (m: number) => NOW - m * 60_000;
const hoursAgo = (h: number) => NOW - h * 3_600_000;
const daysAgo = (d: number) => NOW - d * 86_400_000;

describe("timeAgo", () => {
  it("says 'just now' for very recent timestamps", () => {
    expect(timeAgo(secondsAgo(0), NOW)).toBe("just now");
    expect(timeAgo(secondsAgo(44), NOW)).toBe("just now");
  });

  it("treats slight future skew as 'just now'", () => {
    expect(timeAgo(NOW + 5_000, NOW)).toBe("just now");
  });

  it("rounds 45s..90s up to one minute", () => {
    expect(timeAgo(secondsAgo(45), NOW)).toBe("1m ago");
    expect(timeAgo(secondsAgo(89), NOW)).toBe("1m ago");
  });

  it("formats minutes", () => {
    expect(timeAgo(minutesAgo(12), NOW)).toBe("12m ago");
    expect(timeAgo(minutesAgo(59), NOW)).toBe("59m ago");
  });

  it("formats hours", () => {
    expect(timeAgo(hoursAgo(1), NOW)).toBe("1h ago");
    expect(timeAgo(hoursAgo(23), NOW)).toBe("23h ago");
  });

  it("formats days up to two weeks", () => {
    expect(timeAgo(daysAgo(1), NOW)).toBe("1d ago");
    expect(timeAgo(daysAgo(13), NOW)).toBe("13d ago");
  });

  it("falls back to an absolute date beyond two weeks", () => {
    expect(timeAgo(daysAgo(20), NOW)).toBe("Jun 16");
  });

  it("includes the year when it differs from the current year", () => {
    expect(timeAgo(new Date("2025-12-02T12:00:00Z").getTime(), NOW)).toBe("Dec 2, 2025");
  });

  it("accepts Date instances", () => {
    expect(timeAgo(new Date(minutesAgo(3)), NOW)).toBe("3m ago");
  });
});

describe("formatDuration", () => {
  it("floors sub-second and non-positive durations to 0s", () => {
    expect(formatDuration(0)).toBe("0s");
    expect(formatDuration(-100)).toBe("0s");
    expect(formatDuration(999)).toBe("0s");
  });

  it("formats seconds", () => {
    expect(formatDuration(42_000)).toBe("42s");
  });

  it("formats minutes with seconds", () => {
    expect(formatDuration(4 * 60_000 + 12_000)).toBe("4m 12s");
  });

  it("omits a zero seconds part", () => {
    expect(formatDuration(4 * 60_000)).toBe("4m");
  });

  it("formats hours with minutes", () => {
    expect(formatDuration(3_600_000 + 4 * 60_000)).toBe("1h 4m");
    expect(formatDuration(2 * 3_600_000)).toBe("2h");
  });
});

describe("formatExpiry", () => {
  it("returns 'never' for null", () => {
    expect(formatExpiry(null, NOW)).toBe("never");
  });

  it("returns 'expired' for past timestamps", () => {
    expect(formatExpiry(NOW - 1, NOW)).toBe("expired");
    expect(formatExpiry(NOW, NOW)).toBe("expired");
  });

  it("formats sub-minute expiry", () => {
    expect(formatExpiry(NOW + 30_000, NOW)).toBe("in <1m");
  });

  it("formats minutes, hours and days", () => {
    expect(formatExpiry(NOW + 20 * 60_000, NOW)).toBe("in 20m");
    expect(formatExpiry(NOW + 5 * 3_600_000, NOW)).toBe("in 5h");
    expect(formatExpiry(NOW + 3 * 86_400_000, NOW)).toBe("in 3d");
  });

  it("accepts Date instances", () => {
    expect(formatExpiry(new Date(NOW + 2 * 86_400_000), NOW)).toBe("in 2d");
  });
});

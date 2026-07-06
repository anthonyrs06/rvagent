import { describe, expect, it } from "vitest";

import { computeEngagementScore, engagementTier, FULL_DWELL_MS } from "../scoring";

describe("computeEngagementScore", () => {
  it("scores zero for a no-op session", () => {
    expect(
      computeEngagementScore({
        activeMs: 0,
        completion: 0,
        sectionCoverage: 0,
        reveals: 0,
        returnVisit: false,
      }),
    ).toBe(0);
  });

  it("scores 100 for a fully engaged returning viewer", () => {
    expect(
      computeEngagementScore({
        activeMs: FULL_DWELL_MS,
        completion: 1,
        sectionCoverage: 1,
        reveals: 2,
        returnVisit: true,
      }),
    ).toBe(100);
  });

  it("gives partial dwell credit linearly", () => {
    const half = computeEngagementScore({
      activeMs: FULL_DWELL_MS / 2,
      completion: 0,
      sectionCoverage: 0,
      reveals: 0,
      returnVisit: false,
    });
    expect(half).toBeGreaterThan(15);
    expect(half).toBeLessThan(20);
  });

  it("clamps out-of-range inputs instead of overflowing", () => {
    expect(
      computeEngagementScore({
        activeMs: FULL_DWELL_MS * 50,
        completion: 4,
        sectionCoverage: 9,
        reveals: 100,
        returnVisit: true,
      }),
    ).toBe(100);
  });

  it("treats a resume without sections as full section coverage", () => {
    // Callers pass sectionCoverage = 1 when no sections are defined; the
    // score must not punish resumes that skip zone setup.
    const score = computeEngagementScore({
      activeMs: FULL_DWELL_MS,
      completion: 1,
      sectionCoverage: 1,
      reveals: 0,
      returnVisit: false,
    });
    // dwell(35) + completion(25) + sections(20); no reveal/return credit.
    expect(score).toBe(80);
  });
});

describe("engagementTier", () => {
  it("maps scores to tiers at documented boundaries", () => {
    expect(engagementTier(0)).toBe("cold");
    expect(engagementTier(19)).toBe("cold");
    expect(engagementTier(20)).toBe("skimmed");
    expect(engagementTier(44)).toBe("skimmed");
    expect(engagementTier(45)).toBe("engaged");
    expect(engagementTier(74)).toBe("engaged");
    expect(engagementTier(75)).toBe("hot");
    expect(engagementTier(100)).toBe("hot");
  });
});

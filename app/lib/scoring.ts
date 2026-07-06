/**
 * Engagement scoring — pure functions, unit-tested.
 *
 * The score answers "how seriously did this viewer read the resume?" on a
 * 0..100 scale. Weights favor sustained attention (dwell) and completeness
 * over raw click activity.
 */

export interface EngagementInputs {
  /** Total active reading time in ms (sum of page dwell). */
  activeMs: number;
  /** Pages seen / total pages, 0..1. */
  completion: number;
  /** Named sections dwelled on / total named sections, 0..1 (1 when no sections defined). */
  sectionCoverage: number;
  /** Count of redacted-zone reveals. */
  reveals: number;
  /** True when the same device opened this link in a previous session. */
  returnVisit: boolean;
}

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

/** Saturating ramp: full credit at `fullAt`, linear before. */
const ramp = (value: number, fullAt: number) => clamp01(value / fullAt);

export const ENGAGEMENT_WEIGHTS = {
  dwell: 35,
  completion: 25,
  sections: 20,
  reveals: 10,
  returnVisit: 10,
} as const;

/** Two minutes of active reading earns full dwell credit. */
export const FULL_DWELL_MS = 120_000;

export function computeEngagementScore(inputs: EngagementInputs): number {
  const w = ENGAGEMENT_WEIGHTS;
  const score =
    w.dwell * ramp(inputs.activeMs, FULL_DWELL_MS) +
    w.completion * clamp01(inputs.completion) +
    w.sections * clamp01(inputs.sectionCoverage) +
    w.reveals * ramp(inputs.reveals, 1) +
    w.returnVisit * (inputs.returnVisit ? 1 : 0);
  return Math.round(Math.min(100, Math.max(0, score)));
}

export function engagementTier(score: number): "cold" | "skimmed" | "engaged" | "hot" {
  if (score >= 75) return "hot";
  if (score >= 45) return "engaged";
  if (score >= 20) return "skimmed";
  return "cold";
}

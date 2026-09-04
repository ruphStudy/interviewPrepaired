/**
 * Placement Readiness Engine (15A) — centralized level thresholds and
 * component weights, so both the calculator and any future consumer
 * (15B/15C) read from one source of truth rather than re-declaring bands.
 */
export enum ReadinessLevel {
  NEEDS_FOUNDATION = 'needs_foundation',
  DEVELOPING = 'developing',
  INTERVIEW_READY = 'interview_ready',
  STRONG = 'strong',
  EXCELLENT = 'excellent',
}

// Checked highest-first — the first threshold a score meets or exceeds wins.
const READINESS_LEVEL_THRESHOLDS: ReadonlyArray<{ level: ReadinessLevel; min: number }> = [
  { level: ReadinessLevel.EXCELLENT, min: 90 },
  { level: ReadinessLevel.STRONG, min: 75 },
  { level: ReadinessLevel.INTERVIEW_READY, min: 60 },
  { level: ReadinessLevel.DEVELOPING, min: 40 },
  { level: ReadinessLevel.NEEDS_FOUNDATION, min: 0 },
];

/** Maps a 0-100 readinessScore to its band. Caller must only invoke this when a score actually exists. */
export function getReadinessLevel(score: number): ReadinessLevel {
  for (const { level, min } of READINESS_LEVEL_THRESHOLDS) {
    if (score >= min) {
      return level;
    }
  }
  return ReadinessLevel.NEEDS_FOUNDATION;
}

export type ReadinessComponentKey =
  | 'overallPerformance'
  | 'technical'
  | 'communication'
  | 'problemSolving'
  | 'confidence';

/** Default weights (must sum to 1) — a missing component's weight is redistributed proportionally by normalizing over only the available components' weights. */
export const READINESS_COMPONENT_WEIGHTS: Record<ReadinessComponentKey, number> = {
  overallPerformance: 0.4,
  technical: 0.25,
  communication: 0.15,
  problemSolving: 0.15,
  confidence: 0.05,
};

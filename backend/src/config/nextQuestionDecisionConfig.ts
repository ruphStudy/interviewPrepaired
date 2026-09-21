/**
 * Centralized tuning knobs for NextQuestionDecisionEngine (Phase 3) — every
 * limit/threshold the engine uses lives here, never scattered as a magic
 * number inside the engine itself. Follows this repo's existing
 * config/environment.ts convention: a plain typed const object, hardcoded
 * sensible defaults, optionally overridden via process.env for ops tuning
 * without a redeploy. Never required — every var is optional, unlike the
 * secrets validated by environment.ts's validateEnv().
 */

function intFromEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function floatFromEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = parseFloat(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export interface NextQuestionDecisionConfig {
  /** Hard cap (not a soft penalty) on how many FOLLOW_UP-family questions may target the same source question. */
  maxFollowUpsPerQuestion: number;
  /** Consecutive questions on the same competency before repetition pressure forces a switch. */
  maxConsecutiveSameCompetency: number;
  /** Sliding window (in questions) over which a repeated concept is penalized. */
  recentConceptWindow: number;
  /** coveragePercentage bands (see deriveCoverageBand): >=0 UNTOUCHED boundary is implicit (0). */
  coverageLowThreshold: number; // below this: LOW
  coverageSufficientThreshold: number; // below this: PARTIAL; at/above: SUFFICIENT
  coverageDeepThreshold: number; // at/above this: DEEP
  /** remainingBudget (totalQuestions - currentQuestion) at/below which budget pressure kicks in, favoring blueprint coverage over further probing. */
  lowBudgetThreshold: number;
  /** Multiplier applied to soft-probe-family scores (FOLLOW_UP/DEEPEN/CLARIFY/SCENARIO/CHALLENGE_ASSUMPTION/MEMORY_CALLBACK) once budget pressure is active — claims/contradictions are NOT discounted (verification integrity matters regardless of budget). */
  lowBudgetProbeDiscount: number;
  /** Flat bonus applied to SWITCH_COMPETENCY/CONTINUE_BLUEPRINT scores once budget pressure is active. */
  lowBudgetCoverageBonus: number;
  /** Multiplier used to derive maxQuestionsPerCompetency = ceil((totalQuestions / competencyCount) * this). */
  maxQuestionsPerCompetencyMultiplier: number;
  /** Score subtracted from a candidate whose targetConcept was already covered >=2 times in the recentConceptWindow. */
  repetitionPenalty: number;
  /** Minimum questions since the last MEMORY_CALLBACK before another one is eligible — keeps novelty from dominating. */
  memoryCallbackMinGap: number;
  /** Minimum claim confidence (0-100) required before a claim is probe-worthy. */
  minClaimConfidenceToProbe: number;

  // ==========================================================================
  // Phase 4 (4B) — SCENARIO/CHALLENGE_ASSUMPTION (production/tradeoff)
  // probing. Reuses the existing SCENARIO/CHALLENGE_ASSUMPTION move types and
  // FollowUpOpportunityType taxonomy — these only tune WHEN/HOW STRONGLY the
  // engine's own scoring prefers them, never a second scoring path.
  // ==========================================================================
  /** Blueprint competency weight (0-100) at/above which a competency counts as "high priority" for scenario-probing eligibility. */
  scenarioHighPriorityWeightThreshold: number;
  /** Score bonus applied to a SCENARIO/CHALLENGE_ASSUMPTION candidate when the answer quality is 'strong'. */
  scenarioStrongQualityBonus: number;
  /** Score bonus applied when the answer carries a claim hint (suggests real production experience worth probing). */
  scenarioProductionClaimBonus: number;
  /** Score bonus applied when the target competency is high-priority/high-weight. */
  scenarioHighPriorityCompetencyBonus: number;
  /** Score subtracted from a follow-up-family candidate whose target competency's coverage band is already SUFFICIENT (DEEP applies this at 1.5x) — prefers moving to an uncovered competency over yet more probing of an already-covered one (see the "excellent Redis answer, caching already sufficiently covered" example). */
  competencyOverCoveragePenalty: number;

  // ==========================================================================
  // Phase 5 (5A) — memory-callback candidate SELECTION quality. These tune
  // which `IMemoryItem`s in `interview.interviewMemory.allItems` are
  // eligible/how strongly they score once eligible — never a second scoring
  // path, just centralized knobs for `buildMemoryCallbackCandidates`.
  // ==========================================================================
  /** Minimum questions between an eligible item's own `questionNumber` and the current question — below this it's a normal follow-up, not a "callback". */
  memoryCallbackMinItemAgeGap: number;
  /** Maximum questions between an eligible item's own `questionNumber` and the current question — beyond this the fact is considered too stale to add continuity value. */
  memoryCallbackMaxItemAgeGap: number;
  /** Minimum `IMemoryItem.confidence` (0-1 scale, matches the model's own field) required before an item is callback-worthy. */
  minMemoryItemConfidenceToCallback: number;
  /** Hard cap (not a soft penalty) on how many times a single memory item may ever be selected as a MEMORY_CALLBACK source. */
  maxCallbacksPerMemoryItem: number;
  /** Hard cap (not a soft penalty) on total MEMORY_CALLBACK moves per interview — counted from persisted `decision.moveType` history, no second counter. */
  maxMemoryCallbacksPerInterview: number;
  /** Score bonus applied when an eligible item's own `competencyName` matches the CURRENT target competency (continuity value is highest when it ties back into what's being discussed now). */
  memoryCallbackSameCompetencyBonus: number;
  /** Multiplier applied to an eligible item's 0-1 `confidence` to produce a score bonus (max = this value, at confidence 1.0). */
  memoryCallbackConfidenceWeight: number;

  // ==========================================================================
  // Phase 5 (dedup) — cross-candidate fact deduplication. A cheap
  // normalized-word-overlap ratio (never embeddings/heavy NLP) between two
  // candidates' own reference text (`candidateClaimReference`/
  // `memoryReference`/the contradiction's own source-phrase text) at/above
  // this ratio is treated as "the same underlying fact".
  // ==========================================================================
  factDedupOverlapRatio: number;
}

export const nextQuestionDecisionConfig: NextQuestionDecisionConfig = {
  maxFollowUpsPerQuestion: intFromEnv('NEXT_QUESTION_MAX_FOLLOWUPS_PER_QUESTION', 2),
  maxConsecutiveSameCompetency: intFromEnv('NEXT_QUESTION_MAX_CONSECUTIVE_SAME_COMPETENCY', 3),
  recentConceptWindow: intFromEnv('NEXT_QUESTION_RECENT_CONCEPT_WINDOW', 3),
  coverageLowThreshold: intFromEnv('NEXT_QUESTION_COVERAGE_LOW_THRESHOLD', 25),
  coverageSufficientThreshold: intFromEnv('NEXT_QUESTION_COVERAGE_SUFFICIENT_THRESHOLD', 65),
  coverageDeepThreshold: intFromEnv('NEXT_QUESTION_COVERAGE_DEEP_THRESHOLD', 85),
  lowBudgetThreshold: intFromEnv('NEXT_QUESTION_LOW_BUDGET_THRESHOLD', 2),
  lowBudgetProbeDiscount: 0.5,
  lowBudgetCoverageBonus: 300,
  maxQuestionsPerCompetencyMultiplier: 2,
  repetitionPenalty: 500,
  memoryCallbackMinGap: intFromEnv('NEXT_QUESTION_MEMORY_CALLBACK_MIN_GAP', 4),
  minClaimConfidenceToProbe: intFromEnv('NEXT_QUESTION_MIN_CLAIM_CONFIDENCE', 60),
  scenarioHighPriorityWeightThreshold: intFromEnv('NEXT_QUESTION_SCENARIO_HIGH_WEIGHT_THRESHOLD', 20),
  scenarioStrongQualityBonus: intFromEnv('NEXT_QUESTION_SCENARIO_STRONG_QUALITY_BONUS', 30),
  scenarioProductionClaimBonus: intFromEnv('NEXT_QUESTION_SCENARIO_PRODUCTION_CLAIM_BONUS', 25),
  scenarioHighPriorityCompetencyBonus: intFromEnv('NEXT_QUESTION_SCENARIO_HIGH_PRIORITY_BONUS', 15),
  competencyOverCoveragePenalty: intFromEnv('NEXT_QUESTION_OVER_COVERAGE_PENALTY', 220),

  memoryCallbackMinItemAgeGap: intFromEnv('NEXT_QUESTION_MEMORY_CALLBACK_MIN_ITEM_AGE_GAP', 3),
  memoryCallbackMaxItemAgeGap: intFromEnv('NEXT_QUESTION_MEMORY_CALLBACK_MAX_ITEM_AGE_GAP', 15),
  minMemoryItemConfidenceToCallback: floatFromEnv('NEXT_QUESTION_MIN_MEMORY_ITEM_CONFIDENCE', 0.6),
  maxCallbacksPerMemoryItem: intFromEnv('NEXT_QUESTION_MAX_CALLBACKS_PER_MEMORY_ITEM', 1),
  maxMemoryCallbacksPerInterview: intFromEnv('NEXT_QUESTION_MAX_MEMORY_CALLBACKS_PER_INTERVIEW', 3),
  memoryCallbackSameCompetencyBonus: intFromEnv('NEXT_QUESTION_MEMORY_CALLBACK_SAME_COMPETENCY_BONUS', 40),
  memoryCallbackConfidenceWeight: intFromEnv('NEXT_QUESTION_MEMORY_CALLBACK_CONFIDENCE_WEIGHT', 30),

  factDedupOverlapRatio: floatFromEnv('NEXT_QUESTION_FACT_DEDUP_OVERLAP_RATIO', 0.5),
};

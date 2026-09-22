import { Types } from 'mongoose';
import InterviewConversationEvent, { InterviewConversationEventType } from '../models/InterviewConversationEvent.model';
import Interview, { IQuestion } from '../models/interview.model';
import { InterviewPhase, QuestionSource } from '../constants/interview';
import { INextInterviewMove, NextInterviewMoveType, FOLLOW_UP_FAMILY_MOVE_TYPES } from '../constants/nextQuestionDecision';
import { InterviewBusinessMode, InterviewPersonality } from '../constants/interviewModePolicy';
import { IAnswerSignal } from '../constants/answerSignal';
import { countConsecutiveFollowUpFamilyMoves } from './NextQuestionDecisionEngine';
import { nextQuestionDecisionConfig } from '../config/nextQuestionDecisionConfig';

/**
 * Phase 13 (13A) — PURE OBSERVABILITY. Records that something already
 * decided elsewhere happened; never computes a new decision, never feeds
 * back into one. See InterviewConversationEvent.model.ts's own header for
 * the full non-negotiable list of what this must never store.
 */

export interface RecordEventParams {
  interviewId: string;
  questionNumber?: number;
  eventType: InterviewConversationEventType;
  occurredAt?: Date;
  mode?: InterviewBusinessMode;
  phase?: InterviewPhase;
  competencyKey?: string;
  moveType?: NextInterviewMoveType;
  /** NEVER re-derived from question text — always the already-authoritative field a caller already has in scope. */
  questionSource?: QuestionSource;
  personality?: InterviewPersonality;
  data?: Record<string, string>;
}

/**
 * The ONE write path for `InterviewConversationEvent` — every call site
 * (InterviewService, InterviewAnswerOrchestratorService, the
 * client-telemetry route) uses this; nothing calls
 * `InterviewConversationEvent.create` directly.
 *
 * FAIL-OPEN BY CONSTRUCTION: internal try/catch, logs and swallows on ANY
 * error — including the EXPECTED E11000 duplicate-key error from one of the
 * idempotent event types' partial-unique indexes (a retried request
 * re-emitting an already-recorded lifecycle event), treated as a silent
 * no-op rather than a logged error. NEVER throws to its caller, and its
 * return value (void) is never consumed by any decision/scoring logic —
 * every call site in this codebase invokes it strictly AFTER the real
 * decision/response it describes is already fully determined and persisted,
 * mirroring `AIUsageService.recordAIUsage`'s own "never let bookkeeping fail
 * the underlying request" discipline.
 */
export async function recordEvent(params: RecordEventParams): Promise<void> {
  try {
    if (!Types.ObjectId.isValid(params.interviewId)) return;
    await InterviewConversationEvent.create({
      interviewId: new Types.ObjectId(params.interviewId),
      questionNumber: params.questionNumber,
      eventType: params.eventType,
      occurredAt: params.occurredAt || new Date(),
      origin: 'server',
      mode: params.mode,
      phase: params.phase,
      competencyKey: params.competencyKey,
      moveType: params.moveType,
      questionSource: params.questionSource,
      personality: params.personality,
      data: params.data,
    });
  } catch (error: any) {
    if (error?.code === 11000) {
      return;
    }
    console.error('[InterviewConversationAnalyticsService] Failed to record event (non-critical):', error);
  }
}

// A move type's specific "was selected" event, when one exists — every
// other move type (FOLLOW_UP/DEEPEN/CLARIFY/CHALLENGE_ASSUMPTION/
// CONTINUE_BLUEPRINT) falls back to the generic NEXT_MOVE_SELECTED. This is
// the ONE place that mapping is made — never re-derived at a call site.
const MOVE_TYPE_TO_EVENT_TYPE: Partial<Record<NextInterviewMoveType, InterviewConversationEventType>> = {
  MEMORY_CALLBACK: 'MEMORY_CALLBACK_SELECTED',
  CLAIM_PROBE: 'CLAIM_PROBE_SELECTED',
  CONTRADICTION_PROBE: 'CONTRADICTION_PROBE_SELECTED',
  SCENARIO: 'SCENARIO_PROBE_SELECTED',
  SWITCH_COMPETENCY: 'SWITCH_COMPETENCY_SELECTED',
};

export function eventTypeForMove(moveType: NextInterviewMoveType): InterviewConversationEventType {
  return MOVE_TYPE_TO_EVENT_TYPE[moveType] || 'NEXT_MOVE_SELECTED';
}

export interface RecordMoveDecisionEventsParams {
  interviewId: string;
  /** The NEW question's 1-based number this move produced (or the fixed uploaded-sequence question number). */
  questionNumber: number;
  mode: InterviewBusinessMode;
  finalMove: INextInterviewMove;
  previousPhase: InterviewPhase | undefined;
  newPhase: InterviewPhase;
  /** This turn's answer signal for the JUST-ANSWERED question — undefined for a legacy/first-question case. Used only to check whether a follow-up opportunity existed (FOLLOW_UP_LIMIT_REACHED), never persisted itself. */
  answerSignal?: IAnswerSignal;
  /** interview.questions AS PERSISTED BEFORE this new question was appended — the exact same `history` the decision engine itself read for this turn. */
  history: IQuestion[];
  personality?: InterviewPersonality;
}

/**
 * Records the ONE typed event for this turn's decision (13A's "one event
 * per turn, typed by what was actually selected, not multiple redundant
 * events for the same decision"), plus REPETITION_GUARD_TRIGGERED/
 * FOLLOW_UP_LIMIT_REACHED/phase-transition events when this turn's own
 * already-computed fields indicate they genuinely occurred. Every check
 * here reads an already-explicit field (`finalMove.reasonCode`,
 * `answerSignal.followUpOpportunities`, the engine's OWN exported
 * `countConsecutiveFollowUpFamilyMoves` predicate + its own config
 * threshold) — never a guessed/reverse-engineered reason.
 */
export async function recordMoveDecisionEvents(params: RecordMoveDecisionEventsParams): Promise<void> {
  const { interviewId, questionNumber, mode, finalMove, previousPhase, newPhase, answerSignal, history, personality } = params;

  await recordEvent({
    interviewId,
    questionNumber,
    eventType: eventTypeForMove(finalMove.moveType),
    mode,
    phase: newPhase,
    competencyKey: finalMove.targetCompetency,
    moveType: finalMove.moveType,
    questionSource: finalMove.questionSource,
    personality,
    data: {
      reasonCode: finalMove.reasonCode,
      priority: String(finalMove.priority),
      remainingBudget: String(finalMove.remainingBudget),
      difficultyIntent: finalMove.difficultyIntent,
    },
  });

  // REPETITION_GUARD_TRIGGERED — the engine's OWN `reasonCode` already
  // labels this (buildCoverageCandidates' repetition-forced-switch branch,
  // and deriveFollowUpReasonCode's own repetition_penalty branch) — no new
  // signal needed, just observe the field.
  if (finalMove.reasonCode === 'repetition_penalty') {
    await recordEvent({
      interviewId,
      questionNumber,
      eventType: 'REPETITION_GUARD_TRIGGERED',
      mode,
      phase: newPhase,
      competencyKey: finalMove.targetCompetency,
      moveType: finalMove.moveType,
      personality,
    });
  }

  // FOLLOW_UP_LIMIT_REACHED — the engine's hard cap
  // (buildFollowUpCandidates/buildScenarioCandidates) silently disqualifies
  // every follow-up-family candidate once the consecutive streak hits
  // `maxFollowUpsPerQuestion`, with no labeled reason of its own. Reusing
  // the engine's own EXPORTED predicate + its own config threshold (rather
  // than adding a new field to the engine) is the smallest additive change
  // that surfaces this: fires only when the streak genuinely was AT the cap
  // for this turn, there WAS a follow-up opportunity worth suppressing, and
  // the winning move fell through to something outside the follow-up
  // family despite that — i.e. the cap plausibly is why.
  const followUpStreak = countConsecutiveFollowUpFamilyMoves(history);
  const capReached = followUpStreak >= nextQuestionDecisionConfig.maxFollowUpsPerQuestion;
  const hadFollowUpOpportunity = !!answerSignal && answerSignal.followUpOpportunities.length > 0;
  const moveIsFollowUpFamily = FOLLOW_UP_FAMILY_MOVE_TYPES.includes(finalMove.moveType);
  if (capReached && hadFollowUpOpportunity && !moveIsFollowUpFamily) {
    await recordEvent({
      interviewId,
      questionNumber,
      eventType: 'FOLLOW_UP_LIMIT_REACHED',
      mode,
      phase: newPhase,
      competencyKey: finalMove.targetCompetency,
      personality,
      data: { followUpStreak: String(followUpStreak), cap: String(nextQuestionDecisionConfig.maxFollowUpsPerQuestion) },
    });
  }

  // Phase transition — DEEP_PROBE_ENTERED/EXITED specialize the generic
  // INTERVIEW_PHASE_ENTERED for the one transition family analysts most
  // want to filter on independently; every other real phase change still
  // gets the generic event. Fires only when the phase ACTUALLY changed from
  // the previous turn (never a same-phase-continues no-op event).
  if (previousPhase !== newPhase) {
    if (newPhase === InterviewPhase.DEEP_PROBING) {
      await recordEvent({
        interviewId,
        questionNumber,
        eventType: 'DEEP_PROBE_ENTERED',
        mode,
        phase: newPhase,
        competencyKey: finalMove.targetCompetency,
        personality,
      });
    } else if (previousPhase === InterviewPhase.DEEP_PROBING) {
      await recordEvent({
        interviewId,
        questionNumber,
        eventType: 'DEEP_PROBE_EXITED',
        mode,
        phase: newPhase,
        competencyKey: finalMove.targetCompetency,
        personality,
      });
    } else {
      await recordEvent({ interviewId, questionNumber, eventType: 'INTERVIEW_PHASE_ENTERED', mode, phase: newPhase, personality });
    }
  }
}

// ============================================================================
// Admin-facing aggregation — derived ON DEMAND from persisted event rows,
// never a second source of truth. See admin.controller.ts's
// getInterviewConversationAnalyticsAdmin for the one consumer.
// ============================================================================

export interface InterviewPathSummary {
  totalRealQuestions: number;
  warmUpUsed: boolean;
  followUpCount: number;
  competencySwitchCount: number;
  deepProbeCount: number;
  memoryCallbackCount: number;
  claimProbeCount: number;
  contradictionProbeCount: number;
  scenarioProbeCount: number;
  completed: boolean;
}

/**
 * Compact, derived-at-request-time summary for ONE interview — aggregates
 * this interview's own already-persisted `InterviewConversationEvent` rows
 * rather than a second persisted summary document (per the master prompt's
 * explicit preference: cheap to derive on demand, avoids a second source of
 * truth). `totalRealQuestions` counts distinct `NEXT_MOVE_SELECTED`-family
 * events (never counts WARM_UP_PRESENTED/WARM_UP_ANSWERED — those are
 * structurally excluded by construction, since they are never tagged with
 * a NEXT_MOVE_SELECTED-family eventType).
 */
export async function getInterviewPathSummary(interviewId: string): Promise<InterviewPathSummary | null> {
  if (!Types.ObjectId.isValid(interviewId)) return null;

  const MOVE_EVENT_TYPES: InterviewConversationEventType[] = [
    'NEXT_MOVE_SELECTED',
    'MEMORY_CALLBACK_SELECTED',
    'CLAIM_PROBE_SELECTED',
    'CONTRADICTION_PROBE_SELECTED',
    'SCENARIO_PROBE_SELECTED',
    'SWITCH_COMPETENCY_SELECTED',
  ];

  const rows = await InterviewConversationEvent.find({
    interviewId: new Types.ObjectId(interviewId),
    eventType: { $in: [...MOVE_EVENT_TYPES, 'WARM_UP_PRESENTED', 'DEEP_PROBE_ENTERED', 'INTERVIEW_COMPLETED'] },
  })
    .select('eventType moveType')
    .lean();

  let followUpCount = 0;
  let competencySwitchCount = 0;
  let memoryCallbackCount = 0;
  let claimProbeCount = 0;
  let contradictionProbeCount = 0;
  let scenarioProbeCount = 0;
  let totalRealQuestions = 0;
  let warmUpUsed = false;
  let deepProbeCount = 0;
  let completed = false;

  for (const row of rows) {
    if (row.eventType === 'WARM_UP_PRESENTED') {
      warmUpUsed = true;
      continue;
    }
    if (row.eventType === 'DEEP_PROBE_ENTERED') {
      deepProbeCount += 1;
      continue;
    }
    if (row.eventType === 'INTERVIEW_COMPLETED') {
      completed = true;
      continue;
    }
    if (!MOVE_EVENT_TYPES.includes(row.eventType)) continue;
    totalRealQuestions += 1;
    switch (row.eventType) {
      case 'MEMORY_CALLBACK_SELECTED':
        memoryCallbackCount += 1;
        break;
      case 'CLAIM_PROBE_SELECTED':
        claimProbeCount += 1;
        break;
      case 'CONTRADICTION_PROBE_SELECTED':
        contradictionProbeCount += 1;
        break;
      case 'SCENARIO_PROBE_SELECTED':
        scenarioProbeCount += 1;
        break;
      case 'SWITCH_COMPETENCY_SELECTED':
        competencySwitchCount += 1;
        break;
      case 'NEXT_MOVE_SELECTED':
        if (row.moveType && FOLLOW_UP_FAMILY_MOVE_TYPES.includes(row.moveType)) followUpCount += 1;
        break;
      default:
        break;
    }
  }

  return {
    totalRealQuestions,
    warmUpUsed,
    followUpCount,
    competencySwitchCount,
    deepProbeCount,
    memoryCallbackCount,
    claimProbeCount,
    contradictionProbeCount,
    scenarioProbeCount,
    completed,
  };
}

export interface AdminEventTypeCount {
  eventType: InterviewConversationEventType;
  count: number;
}

/** Admin-only aggregate: event counts by type in the last `days` days — read-only, no candidate-facing consumer. */
export async function getEventTypeCountsSince(days: number): Promise<AdminEventTypeCount[]> {
  const since = new Date(Date.now() - Math.max(1, days) * 24 * 60 * 60 * 1000);
  const rows = await InterviewConversationEvent.aggregate([
    { $match: { occurredAt: { $gte: since } } },
    { $group: { _id: '$eventType', count: { $sum: 1 } } },
    { $sort: { count: -1 } },
  ]);
  return rows.map((r) => ({ eventType: r._id, count: r.count }));
}

// ============================================================================
// Phase 13 (13B) — client-origin telemetry ingestion. The ONE server-side
// entry point `POST /interview/:id/client-telemetry` (InterviewController.
// submitClientTelemetry) calls. Bounded, minimally-validated, FAIL-OPEN:
// never throws, so a malformed/oversized batch from a stale or buggy client
// build can never turn into a 500 for what is, by design, best-effort
// observability.
// ============================================================================

/** Only these client-origin eventTypes are ever accepted — a client can never inject a server-only eventType (e.g. INTERVIEW_COMPLETED) by construction. */
const CLIENT_EVENT_TYPES = new Set<InterviewConversationEventType>([
  'ANSWER_ROUND_TRIP_MEASURED',
  'TTS_PLAYBACK_STARTED',
  'TTS_PLAYBACK_COMPLETED',
  'TTS_BROWSER_FALLBACK',
  'STALE_AUDIO_PLAN_DISCARDED',
  'AVATAR_STATE_CHANGED',
  'AVATAR_VIDEO_LOAD_FAILED',
  'AVATAR_AUTOPLAY_BLOCKED',
  'AVATAR_FALLBACK_USED',
  'MICRO_BEHAVIOR_TRIGGERED',
]);

const MAX_CLIENT_TELEMETRY_BATCH_SIZE = 50;
const MAX_CLIENT_TELEMETRY_DATA_KEYS = 10;
const MAX_CLIENT_TELEMETRY_VALUE_LENGTH = 200;

export interface ClientTelemetryEventInput {
  eventType: string;
  questionNumber?: number;
  /** Client-measured epoch ms (`Date.now()`) — ordering/record-keeping only, NEVER compared against a server timestamp for a duration calculation (every duration the client sends is itself already computed entirely client-side via `performance.now()`, e.g. inside `data.durationMs`). */
  occurredAt?: number;
  data?: Record<string, unknown>;
}

/** Strips anything not a bounded, already-primitive value — never accepts free-form/long text (no transcript/PII duplication risk). */
function sanitizeClientEventData(data: unknown): Record<string, string> | undefined {
  if (!data || typeof data !== 'object') return undefined;
  const out: Record<string, string> = {};
  let count = 0;
  for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
    if (count >= MAX_CLIENT_TELEMETRY_DATA_KEYS) break;
    if (typeof key !== 'string' || key.length === 0 || key.length > 64) continue;
    if (typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'boolean') continue;
    out[key] = String(value).slice(0, MAX_CLIENT_TELEMETRY_VALUE_LENGTH);
    count += 1;
  }
  return count > 0 ? out : undefined;
}

export interface RecordClientTelemetryBatchParams {
  interviewId: string;
  userId: string;
  events: ClientTelemetryEventInput[];
}

/**
 * FAIL-OPEN AND BOUNDED BY CONSTRUCTION: caps the batch at
 * `MAX_CLIENT_TELEMETRY_BATCH_SIZE`, verifies the interview belongs to the
 * calling user (a silent no-op — never an error — for a mismatch, since
 * failing a telemetry request is never worth it), skips any event whose
 * `eventType` isn't in the client allowlist, and never throws to its
 * caller — the route always responds success regardless of what happened
 * here, matching this phase's "the frontend's own POST call must be
 * fire-and-forget" requirement on the SERVER side too (a slow/failed batch
 * write can never surface as a client-visible error).
 */
export async function recordClientTelemetryBatch(params: RecordClientTelemetryBatchParams): Promise<void> {
  try {
    if (!Types.ObjectId.isValid(params.interviewId) || !Types.ObjectId.isValid(params.userId)) return;
    const interview = await Interview.findOne({
      _id: new Types.ObjectId(params.interviewId),
      userId: new Types.ObjectId(params.userId),
    })
      .select('_id')
      .lean();
    if (!interview) return;

    const events = Array.isArray(params.events) ? params.events.slice(0, MAX_CLIENT_TELEMETRY_BATCH_SIZE) : [];
    for (const event of events) {
      if (!event || typeof event.eventType !== 'string') continue;
      if (!CLIENT_EVENT_TYPES.has(event.eventType as InterviewConversationEventType)) continue;

      const occurredAt = typeof event.occurredAt === 'number' && Number.isFinite(event.occurredAt) ? new Date(event.occurredAt) : new Date();
      try {
        await InterviewConversationEvent.create({
          interviewId: new Types.ObjectId(params.interviewId),
          questionNumber: typeof event.questionNumber === 'number' ? event.questionNumber : undefined,
          eventType: event.eventType,
          occurredAt,
          origin: 'client',
          data: sanitizeClientEventData(event.data),
        });
      } catch (err: any) {
        if (err?.code !== 11000) {
          console.error('[InterviewConversationAnalyticsService] Failed to record client event (non-critical):', err);
        }
      }
    }
  } catch (error) {
    console.error('[InterviewConversationAnalyticsService] Failed to record client telemetry batch (non-critical):', error);
  }
}

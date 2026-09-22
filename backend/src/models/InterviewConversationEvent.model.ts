import mongoose, { Schema, Document, Types } from 'mongoose';
import { NextInterviewMoveType } from '../constants/nextQuestionDecision';
import { QuestionSource, InterviewPhase } from '../constants/interview';
import { InterviewBusinessMode, InterviewPersonality } from '../constants/interviewModePolicy';

/**
 * Phase 13 (13A/13B) — PURE OBSERVABILITY. A durable record that something
 * ALREADY DECIDED elsewhere (a `NextQuestionDecisionEngine` move, a phase
 * transition, a client-measured TTS/avatar outcome) occurred — mirrors
 * `EmployerIntegrationEvent.model.ts`'s exact shape/discipline (typed
 * `eventType` string-literal union, entity ids, `occurredAt: Date`, a
 * bounded `data?: Map<string, string>` field for safe extra context).
 *
 * Deliberately bounded: NEVER stores candidate answer text, question text,
 * transcripts, resumes, or any chain-of-thought/free-form reasoning — only
 * IDs/type/timestamps/already-explicit structured fields (stringified
 * enums/numbers) a downstream analytics consumer needs. `data` values are
 * always copies of an already-computed, already-safe field elsewhere
 * (`remainingBudget`, `followUpStreak`, `cacheHit`, `latencyTier`, ...),
 * never newly-derived judgment/reasoning text.
 *
 * This model is written to from TWO origins:
 *  - `origin: 'server'` — emitted by `InterviewConversationAnalyticsService.
 *    recordEvent` from `InterviewService`/`InterviewAnswerOrchestratorService`
 *    AFTER the real decision/response is already determined (13A).
 *  - `origin: 'client'` — emitted by the frontend's batched
 *    `POST /interview/:id/client-telemetry` endpoint, reporting
 *    browser-measured latency/TTS/avatar outcomes (13B). Client-origin rows
 *    are minimally validated, never trusted as authoritative for anything
 *    scoring/decision-related.
 *
 * No candidate-facing read endpoint exists for this model anywhere in this
 * codebase — it is queried only by admin-gated aggregation endpoints/
 * internal reporting. Analytics recorded here is NEVER read back by any
 * interview decision/scoring path (verified by construction: nothing in
 * `NextQuestionDecisionEngine`/`InterviewService`/`AnswerSignalService`
 * imports this model).
 */
export type InterviewConversationEventType =
  // ---- 13A (server-origin) ----
  | 'INTERVIEW_PHASE_ENTERED'
  | 'DEEP_PROBE_ENTERED'
  | 'DEEP_PROBE_EXITED'
  | 'NEXT_MOVE_SELECTED'
  | 'MEMORY_CALLBACK_SELECTED'
  | 'CLAIM_PROBE_SELECTED'
  | 'CONTRADICTION_PROBE_SELECTED'
  | 'SCENARIO_PROBE_SELECTED'
  | 'SWITCH_COMPETENCY_SELECTED'
  | 'FOLLOW_UP_LIMIT_REACHED'
  | 'REPETITION_GUARD_TRIGGERED'
  | 'WARM_UP_PRESENTED'
  | 'WARM_UP_ANSWERED'
  | 'INTERVIEW_COMPLETED'
  // ---- 13B (client-origin) ----
  | 'ANSWER_ROUND_TRIP_MEASURED'
  | 'TTS_PLAYBACK_STARTED'
  | 'TTS_PLAYBACK_COMPLETED'
  | 'TTS_BROWSER_FALLBACK'
  | 'STALE_AUDIO_PLAN_DISCARDED'
  | 'AVATAR_STATE_CHANGED'
  | 'AVATAR_VIDEO_LOAD_FAILED'
  | 'AVATAR_AUTOPLAY_BLOCKED'
  | 'AVATAR_FALLBACK_USED'
  | 'MICRO_BEHAVIOR_TRIGGERED';

export const INTERVIEW_CONVERSATION_EVENT_TYPE_VALUES: InterviewConversationEventType[] = [
  'INTERVIEW_PHASE_ENTERED',
  'DEEP_PROBE_ENTERED',
  'DEEP_PROBE_EXITED',
  'NEXT_MOVE_SELECTED',
  'MEMORY_CALLBACK_SELECTED',
  'CLAIM_PROBE_SELECTED',
  'CONTRADICTION_PROBE_SELECTED',
  'SCENARIO_PROBE_SELECTED',
  'SWITCH_COMPETENCY_SELECTED',
  'FOLLOW_UP_LIMIT_REACHED',
  'REPETITION_GUARD_TRIGGERED',
  'WARM_UP_PRESENTED',
  'WARM_UP_ANSWERED',
  'INTERVIEW_COMPLETED',
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
];

// Lifecycle events that must never double-fire on a retried request — a
// plain {interviewId, eventType} uniqueness is correct for these because
// each can genuinely happen AT MOST ONCE per interview, ever.
export const INTERVIEW_SCOPED_IDEMPOTENT_EVENT_TYPES: InterviewConversationEventType[] = [
  'INTERVIEW_COMPLETED',
  'WARM_UP_PRESENTED',
  'WARM_UP_ANSWERED',
];

// Events that CAN legitimately happen more than once per interview (e.g. the
// candidate enters/exits deep probing multiple times across an interview),
// but must not double-fire for the SAME question on a retry — scoped
// uniqueness one level finer than the interview-scoped set above.
export const QUESTION_SCOPED_IDEMPOTENT_EVENT_TYPES: InterviewConversationEventType[] = ['DEEP_PROBE_ENTERED', 'DEEP_PROBE_EXITED'];

export interface IInterviewConversationEvent extends Document {
  interviewId: Types.ObjectId;
  /** 1-based displayed question number this event relates to, when applicable. Absent for interview-level events (e.g. INTERVIEW_COMPLETED). */
  questionNumber?: number;
  eventType: InterviewConversationEventType;
  occurredAt: Date;
  origin: 'server' | 'client';
  mode?: InterviewBusinessMode;
  phase?: InterviewPhase;
  competencyKey?: string;
  moveType?: NextInterviewMoveType;
  /** NEVER re-derived from question text — always copied verbatim from the already-authoritative field the decision engine set (Phase 1's QuestionSource). */
  questionSource?: QuestionSource;
  personality?: InterviewPersonality;
  /**
   * Bounded, non-confidential extra context (e.g. `{remainingBudget: '3',
   * followUpStreak: '2', cacheHit: 'false', latencyTier: 'SHORT'}`) — always
   * a stringified copy of an already-explicit numeric/enum/boolean field.
   * NEVER free-form reasoning text, NEVER candidate answer/question content.
   * A plain object may be passed in when creating a document; Mongoose
   * always materializes this as a real `Map` on read.
   */
  data?: Map<string, string>;
  createdAt: Date;
}

const interviewConversationEventSchema = new Schema<IInterviewConversationEvent>(
  {
    interviewId: { type: Schema.Types.ObjectId, ref: 'Interview', required: true },
    questionNumber: { type: Number, min: 0 },
    eventType: { type: String, enum: INTERVIEW_CONVERSATION_EVENT_TYPE_VALUES, required: true },
    occurredAt: { type: Date, required: true },
    origin: { type: String, enum: ['server', 'client'], required: true },
    mode: { type: String, enum: ['practice', 'institute', 'employer'] },
    phase: { type: String, enum: Object.values(InterviewPhase) },
    competencyKey: { type: String, trim: true, maxlength: [200, 'competencyKey cannot exceed 200 characters'] },
    moveType: { type: String },
    questionSource: { type: String },
    personality: { type: String, enum: ['PROFESSIONAL', 'FRIENDLY', 'CHALLENGING'] },
    data: { type: Map, of: String },
  },
  {
    // No updatedAt — write-once, matching EmployerIntegrationEvent's own convention.
    timestamps: { createdAt: true, updatedAt: false },
    collection: 'interview_conversation_events',
  }
);

interviewConversationEventSchema.index({ interviewId: 1, occurredAt: 1 });
interviewConversationEventSchema.index({ eventType: 1, occurredAt: -1 });

// Idempotency guards — see the two exported constants above for why these
// are split into interview-scoped vs question-scoped. Each partial filter
// uses a plain equality expression (the only form MongoDB partial-index
// filters reliably support), so this is three interview-scoped indexes plus
// two question-scoped indexes rather than one shared $in-based filter.
interviewConversationEventSchema.index(
  { interviewId: 1, eventType: 1 },
  { unique: true, partialFilterExpression: { eventType: 'INTERVIEW_COMPLETED' }, name: 'uniq_interview_completed' }
);
interviewConversationEventSchema.index(
  { interviewId: 1, eventType: 1 },
  { unique: true, partialFilterExpression: { eventType: 'WARM_UP_PRESENTED' }, name: 'uniq_warmup_presented' }
);
interviewConversationEventSchema.index(
  { interviewId: 1, eventType: 1 },
  { unique: true, partialFilterExpression: { eventType: 'WARM_UP_ANSWERED' }, name: 'uniq_warmup_answered' }
);
interviewConversationEventSchema.index(
  { interviewId: 1, questionNumber: 1, eventType: 1 },
  { unique: true, partialFilterExpression: { eventType: 'DEEP_PROBE_ENTERED' }, name: 'uniq_deep_probe_entered_per_question' }
);
interviewConversationEventSchema.index(
  { interviewId: 1, questionNumber: 1, eventType: 1 },
  { unique: true, partialFilterExpression: { eventType: 'DEEP_PROBE_EXITED' }, name: 'uniq_deep_probe_exited_per_question' }
);

export const InterviewConversationEvent = mongoose.model<IInterviewConversationEvent>(
  'InterviewConversationEvent',
  interviewConversationEventSchema
);

export default InterviewConversationEvent;

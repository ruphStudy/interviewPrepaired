/**
 * Phase 9 ("Hybrid Audio Architecture") — the segment-type vocabulary a
 * turn's spoken content decomposes into for AUDIO ROUTING purposes.
 *
 * Distinct from (but derived from) Phase 8's `PhraseCategory`/
 * `PresentationType` (constants/phraseLibrary.ts /
 * constants/conversationHumanizer.ts) — those describe conversational
 * PURPOSE ("this is a probe lead-in"), this describes ROUTING relevance
 * ("this is a short pre-recordable fixed phrase vs. per-turn dynamic
 * text"). `AudioRoutingService` is the one consumer that cares about this
 * distinction; nothing here changes what gets said, only how the decision
 * of HOW to voice it is made.
 */

import { PhraseCategory } from './phraseLibrary';

export const AUDIO_SEGMENT_TYPE_VALUES = [
  'FIXED_REACTION',
  'FIXED_TRANSITION',
  'FIXED_THINKING',
  'FIXED_WELCOME',
  'FIXED_CLOSING',
  'DYNAMIC_QUESTION',
  'DYNAMIC_CONTEXTUAL_FOLLOWUP',
] as const;

export type AudioSegmentType = (typeof AUDIO_SEGMENT_TYPE_VALUES)[number];

/**
 * Maps every Phase 8 `PhraseCategory` to its routing-relevant
 * `AudioSegmentType`. Every PHRASE_LIBRARY category is FIXED (a bounded,
 * pre-recordable set of short phrases) by construction — only the runtime
 * `spokenQuestionText` (and a future contextual follow-up, not built by any
 * phase yet) is ever DYNAMIC. Phase 11 finally wires up `FIXED_WELCOME`/
 * `FIXED_CLOSING` to their now-real `PhraseCategory` counterparts
 * (`phraseLibrary.ts`'s `WELCOME`/`CLOSING`) — the frontend's older, static
 * `interviewPhrases.ts` table remains only as the absent-`presentation`
 * fallback (see InterviewScreen.tsx's `startWelcomeSequence`/completion
 * handling), never the routing source of truth.
 */
export const AUDIO_SEGMENT_TYPE_BY_PHRASE_CATEGORY: Record<PhraseCategory, AudioSegmentType> = {
  NEUTRAL_ACK: 'FIXED_REACTION',
  NO_ANSWER: 'FIXED_REACTION',
  LONG_ANSWER: 'FIXED_REACTION',
  THINKING: 'FIXED_THINKING',
  DELAY_BRIDGE: 'FIXED_THINKING',
  PROBE: 'FIXED_TRANSITION',
  TRANSITION: 'FIXED_TRANSITION',
  CLARIFY: 'FIXED_TRANSITION',
  CALLBACK: 'FIXED_TRANSITION',
  CONTRADICTION_NEUTRAL: 'FIXED_TRANSITION',
  CHALLENGE: 'FIXED_TRANSITION',
  WELCOME: 'FIXED_WELCOME',
  CLOSING: 'FIXED_CLOSING',
};

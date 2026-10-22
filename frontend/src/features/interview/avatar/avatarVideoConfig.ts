/**
 * Centralized reusable-avatar video configuration.
 *
 * Source video files live in `/Users/.../interviewPrepaired/videofiles`
 * (`script 1.mp4` ... `script 81.mp4`, space-separated). Vite cannot serve
 * files from outside the project, so a frontend-accessible copy of the
 * clips this MVP pool actually uses was copied (filename space removed, no
 * other change) into `frontend/public/videos/avatar/scriptN.mp4` — the
 * standard Vite "static public asset" convention, served as-is at
 * `/videos/avatar/scriptN.mp4`.
 *
 * This is the ONLY file that should ever reference a `scriptN` filename —
 * `InterviewerAvatar.tsx`/`avatarReactionManager.ts`/`InterviewScreen.tsx`
 * only ever deal with the typed `AvatarVideoState`/`QuestionVisualIntent`
 * values below, never a raw path.
 *
 * MVP pool is deliberately a small, reliable subset of the ~80 available
 * clips (per the master spec) — NOT every clip is wired up. Swapping to a
 * future avatar pack (e.g. a different interviewer persona) only requires
 * replacing the `src` values below; nothing else in the avatar system
 * needs to change.
 */

export type AvatarVideoState =
  | 'idle'
  | 'welcome'
  | 'normalQuestion'
  | 'listening'
  | 'waiting'
  | 'thinking'
  | 'acknowledge'
  | 'probe'
  | 'transition'
  | 'clarify'
  | 'challenge'
  | 'callback'
  | 'closing'
  | 'closingNod'
  | 'smile'
  | 'nod';

/** Semantic classification of the CURRENT question, used only to pick which speaking pool to draw from (see QUESTION_INTENT_TO_VIDEO_STATE). Never sent anywhere, never affects question generation/evaluation. */
export type QuestionVisualIntent = 'normal' | 'followUp' | 'topicChange' | 'clarification' | 'challenge' | 'callback';

export interface AvatarClip {
  id: string;
  src: string;
  /** Horizontally mirrors the clip (CSS `scaleX(-1)`) — used for the script76→"right look" substitution (see KNOWN_REPLACEMENTS below). */
  mirrored?: boolean;
}

function clip(scriptNumber: number, mirrored?: boolean): AvatarClip {
  return { id: `script${scriptNumber}`, src: `/videos/avatar/script${scriptNumber}.mp4`, mirrored };
}

/**
 * One pool per avatar video state that actually has video (`idle` renders
 * no video — the component's existing static-image fallback covers it).
 * Where a state has multiple clips, `avatarReactionManager` picks randomly
 * and avoids repeating the immediately-previous clip for that state.
 */
export const AVATAR_VIDEO_POOLS: Record<Exclude<AvatarVideoState, 'idle'>, AvatarClip[]> = {
  welcome: [clip(1), clip(2)],
  normalQuestion: [clip(20), clip(21), clip(23)],
  probe: [clip(22), clip(24), clip(27)], // follow-up questions
  transition: [clip(28), clip(29)], // topic change
  clarify: [clip(37), clip(39)],
  challenge: [clip(47), clip(48)],
  callback: [clip(51), clip(53)],
  listening: [clip(70), clip(71), clip(78)],
  thinking: [clip(72), clip(73)],
  acknowledge: [clip(7), clip(9), clip(11)],
  waiting: [clip(57)],
  closing: [clip(63), clip(65), clip(67)],
  closingNod: [clip(80)],
  smile: [clip(79)],
  nod: [clip(74)],
};

/** Maps the lightweight question-intent classification to the AvatarVideoState whose pool should be used while that question's TTS plays. */
export const QUESTION_INTENT_TO_VIDEO_STATE: Record<QuestionVisualIntent, AvatarVideoState> = {
  normal: 'normalQuestion',
  followUp: 'probe',
  topicChange: 'transition',
  clarification: 'clarify',
  challenge: 'challenge',
  callback: 'callback',
};

export function getPoolForState(state: AvatarVideoState): AvatarClip[] {
  if (state === 'idle') return [];
  return AVATAR_VIDEO_POOLS[state] ?? [];
}

export function getPoolForQuestionIntent(intent: QuestionVisualIntent): AvatarClip[] {
  return getPoolForState(QUESTION_INTENT_TO_VIDEO_STATE[intent]);
}

/** States whose video should LOOP for the duration it's shown — TTS duration is unpredictable and the avatar must never freeze while it's still speaking. */
export const LOOPING_STATES: ReadonlySet<AvatarVideoState> = new Set<AvatarVideoState>([
  'listening',
  'waiting',
  'thinking',
  'welcome',
  'normalQuestion',
  'probe',
  'transition',
  'clarify',
  'challenge',
  'callback',
  'closing',
]);

/** One-shot states — play once, then the caller reverts to a resting state (listening/idle). */
export const ONE_SHOT_STATES: ReadonlySet<AvatarVideoState> = new Set<AvatarVideoState>([
  'acknowledge',
  'nod',
  'smile',
  'closingNod',
]);

/** Approximate one-shot clip duration used to schedule the return-to-resting-state when no `onEnded` event is wired (kept short/subtle, matches the source clips). */
export const ONE_SHOT_FALLBACK_DURATION_MS = 1500;

/**
 * Known problematic-clip substitutions (see master spec) — applied AT THE
 * SOURCE here so no caller ever needs to know script6/75/77 exist at all.
 * - script6 (reassurance) -> reuse script57 (already the `waiting` pool's only clip).
 * - script75 (double nod) -> reuse script74 twice in sequence (see
 *   `getDoubleNodSequence` below) rather than the original asset.
 * - script77 (look right) -> reuse script76 mirrored via CSS `scaleX(-1)`.
 */
export const KNOWN_REPLACEMENTS = {
  /** Substitutes script6 wherever a reassuring visual would be needed. */
  reassurance: AVATAR_VIDEO_POOLS.waiting[0],
  /** Substitutes script77 — available for a future "candidate distracted"/look-away trigger; not auto-fired by the MVP lifecycle today. */
  rightLook: clip(76, true),
} as const;

/** Plays the SAME nod clip twice (script75 replacement) — returns both entries; the caller (avatarReactionManager) re-triggers playback for the second entry once the first finishes. */
export function getDoubleNodSequence(): [AvatarClip, AvatarClip] {
  const nodClip = AVATAR_VIDEO_POOLS.nod[0];
  return [nodClip, nodClip];
}

/** Clips preloaded eagerly (small, high-frequency set) — everything else loads on first use. Mirrors the master spec's explicit preload list. */
export const PRELOAD_CLIP_IDS: ReadonlySet<string> = new Set<string>([
  'script1', // welcome
  'script20', // normal question
  'script70', // listening
  'script72', // thinking
  'script74', // nod
  'script63', // closing
]);

export function isPreloadClip(c: AvatarClip): boolean {
  return PRELOAD_CLIP_IDS.has(c.id);
}

/** Every clip this config references — used by InterviewerAvatar to build the preload set and by tests to assert "every configured id resolves to a real public file". */
export function getAllConfiguredClips(): AvatarClip[] {
  return [...Object.values(AVATAR_VIDEO_POOLS).flat(), KNOWN_REPLACEMENTS.rightLook];
}

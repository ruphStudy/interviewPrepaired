// Centralized interviewer media asset configuration. Keeping every file path
// here (instead of spread across InterviewScreen/InterviewAvatar) is what
// lets us later add alternate packs (female interviewer, other male
// interviewers, personality/style packs) by adding another pack object and
// changing `getActiveInterviewerPack()` — nothing else in the avatar
// behavior controller or InterviewScreen needs to change.

export type SpeakingClipKey = 'talking-1' | 'talking-2' | 'talking-3';
export type ListeningReactionCategory = 'neutral' | 'positive' | 'strong';
export type NeutralClipKey = 'listen-neutral-1' | 'listen-neutral-2' | 'listen-neutral-3';
export type PositiveClipKey = 'listen-positive-1' | 'listen-positive-2';
export type StrongClipKey = 'listen-strong-1';
export type ListeningClipKey = NeutralClipKey | PositiveClipKey | StrongClipKey;

export interface InterviewerMediaPack {
  idle: string;
  speaking: Record<SpeakingClipKey, string>;
  listening: {
    neutral: Record<NeutralClipKey, string>;
    positive: Record<PositiveClipKey, string>;
    strong: Record<StrongClipKey, string>;
  };
  interruption: string;
}

const BASE_PATH = '/assets/interviewer';

const DEFAULT_MALE_INTERVIEWER_PACK: InterviewerMediaPack = {
  idle: `${BASE_PATH}/idle.png`,
  speaking: {
    'talking-1': `${BASE_PATH}/talking-1.mp4`,
    'talking-2': `${BASE_PATH}/talking-2.mp4`,
    'talking-3': `${BASE_PATH}/talking-3.mp4`,
  },
  listening: {
    neutral: {
      'listen-neutral-1': `${BASE_PATH}/listen-neutral-1.mp4`,
      'listen-neutral-2': `${BASE_PATH}/listen-neutral-2.mp4`,
      'listen-neutral-3': `${BASE_PATH}/listen-neutral-3.mp4`,
    },
    positive: {
      'listen-positive-1': `${BASE_PATH}/listen-positive-1.mp4`,
      'listen-positive-2': `${BASE_PATH}/listen-positive-2.mp4`,
    },
    strong: {
      'listen-strong-1': `${BASE_PATH}/listen-strong-1.mp4`,
    },
  },
  interruption: `${BASE_PATH}/interruption.mp4`,
};

/** Single seam for future interviewer packs — swap the returned pack (e.g. by profile/settings) without touching the behavior controller or InterviewScreen. */
export function getActiveInterviewerPack(): InterviewerMediaPack {
  return DEFAULT_MALE_INTERVIEWER_PACK;
}

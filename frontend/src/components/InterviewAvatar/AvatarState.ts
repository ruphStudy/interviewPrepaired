export enum AvatarState {
  SPEAKING = 'SPEAKING',
  LISTENING = 'LISTENING',
  THINKING = 'THINKING',
  IDLE = 'IDLE',
  COMPLETED = 'COMPLETED',
}

export interface InterviewState {
  phase: 'WELCOME' | 'QUESTION' | 'LISTENING' | 'PROCESSING' | 'NEXT_QUESTION' | 'COMPLETED';
  avatarState: AvatarState;
  currentQuestionNumber: number;
  totalQuestions: number;
  isAnswering: boolean;
  isSpeaking: boolean;
}

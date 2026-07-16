import { create } from 'zustand';
import { Interview, Question, Answer, Evaluation, InterviewReport } from '../types';

interface InterviewState {
  // Current interview session
  currentInterview: Interview | null;
  currentQuestion: Question | null;
  currentAnswer: string;
  currentEvaluation: Evaluation | null;
  
  // Interview flow
  questions: Question[];
  answers: Map<string, Answer>;
  evaluations: Map<string, Evaluation>;
  
  // UI state
  isRecording: boolean;
  isProcessing: boolean;
  isSpeaking: boolean;
  
  // Actions
  setCurrentInterview: (interview: Interview | null) => void;
  setCurrentQuestion: (question: Question | null) => void;
  setCurrentAnswer: (answer: string) => void;
  setCurrentEvaluation: (evaluation: Evaluation | null) => void;
  addQuestion: (question: Question) => void;
  addAnswer: (questionId: string, answer: Answer) => void;
  addEvaluation: (answerId: string, evaluation: Evaluation) => void;
  setIsRecording: (isRecording: boolean) => void;
  setIsProcessing: (isProcessing: boolean) => void;
  setIsSpeaking: (isSpeaking: boolean) => void;
  resetInterview: () => void;
}

export const useInterviewStore = create<InterviewState>((set) => ({
  // Initial state
  currentInterview: null,
  currentQuestion: null,
  currentAnswer: '',
  currentEvaluation: null,
  questions: [],
  answers: new Map(),
  evaluations: new Map(),
  isRecording: false,
  isProcessing: false,
  isSpeaking: false,

  // Actions
  setCurrentInterview: (interview) => set({ currentInterview: interview }),
  
  setCurrentQuestion: (question) => set({ currentQuestion: question }),
  
  setCurrentAnswer: (answer) => set({ currentAnswer: answer }),
  
  setCurrentEvaluation: (evaluation) => set({ currentEvaluation: evaluation }),
  
  addQuestion: (question) =>
    set((state) => ({
      questions: [...state.questions, question],
    })),
  
  addAnswer: (questionId, answer) =>
    set((state) => {
      const newAnswers = new Map(state.answers);
      newAnswers.set(questionId, answer);
      return { answers: newAnswers };
    }),
  
  addEvaluation: (answerId, evaluation) =>
    set((state) => {
      const newEvaluations = new Map(state.evaluations);
      newEvaluations.set(answerId, evaluation);
      return { evaluations: newEvaluations };
    }),
  
  setIsRecording: (isRecording) => set({ isRecording }),
  
  setIsProcessing: (isProcessing) => set({ isProcessing }),
  
  setIsSpeaking: (isSpeaking) => set({ isSpeaking }),
  
  resetInterview: () =>
    set({
      currentInterview: null,
      currentQuestion: null,
      currentAnswer: '',
      currentEvaluation: null,
      questions: [],
      answers: new Map(),
      evaluations: new Map(),
      isRecording: false,
      isProcessing: false,
      isSpeaking: false,
    }),
}));

// Settings store
interface SettingsState {
  theme: 'light' | 'dark';
  voiceEnabled: boolean;
  selectedVoice: string | null;
  toggleTheme: () => void;
  setVoiceEnabled: (enabled: boolean) => void;
  setSelectedVoice: (voice: string) => void;
}

export const useSettingsStore = create<SettingsState>((set) => ({
  theme: 'light',
  voiceEnabled: true,
  selectedVoice: null,
  
  toggleTheme: () =>
    set((state) => {
      const newTheme = state.theme === 'light' ? 'dark' : 'light';
      document.documentElement.classList.toggle('dark', newTheme === 'dark');
      return { theme: newTheme };
    }),
  
  setVoiceEnabled: (enabled) => set({ voiceEnabled: enabled }),
  
  setSelectedVoice: (voice) => set({ selectedVoice: voice }),
}));

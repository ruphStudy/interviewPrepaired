export type InterviewType =
  | 'technical'
  | 'behavioral'
  | 'leadership'
  | 'managerial'
  | 'system-design'
  | 'coding'
  | 'product'
  | 'general';

export type DifficultyLevel = 'beginner' | 'intermediate' | 'advanced' | 'expert';

export type InterviewStatus =
  | 'created'
  | 'in-progress'
  | 'paused'
  | 'completed'
  | 'evaluated'
  | 'archived';

export type Grade = 'A+' | 'A' | 'B' | 'C' | 'D' | 'F';

export interface QuestionRequest {
  type: InterviewType;
  difficulty: DifficultyLevel;
  topic: string;
  customInstructions?: string;
  previousQuestions: string[];
}

export interface QuestionResponse {
  text: string;
  followUps: string[];
}

export interface EvaluationRequest {
  type: InterviewType;
  difficulty: DifficultyLevel;
  topic: string;
  questions: Array<{
    text: string;
    answer?: {
      text: string;
      transcriptionConfidence: number;
      duration: number;
    };
  }>;
}

export interface ScoreBreakdown {
  technicalKnowledge: number;
  communication: number;
  leadership: number;
  problemSolving: number;
  confidence: number;
}

export interface EvaluationResult {
  overallScore: number;
  grade: Grade;
  breakdown: ScoreBreakdown;
  strengths: string[];
  weaknesses: string[];
  suggestions: string[];
  recommendedTopics: string[];
  detailedFeedback: string;
}

export interface UserPreferences {
  defaultInterviewType?: InterviewType;
  defaultDifficulty?: DifficultyLevel;
  notifications: boolean;
  theme: 'light' | 'dark' | 'auto';
}

export interface UserStats {
  totalInterviews: number;
  completedInterviews: number;
  averageScore: number;
  lastInterviewDate?: Date;
}

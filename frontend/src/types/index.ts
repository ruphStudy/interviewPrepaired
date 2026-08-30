export interface Interview {
  id: string;
  topic: string;
  difficulty: 'Beginner' | 'Intermediate' | 'Advanced' | 'Expert';
  experience: number;
  numberOfQuestions: number;
  jobDescription?: string;
  createdAt: string;
  completedAt?: string;
  status: 'in-progress' | 'completed' | 'paused';
}

export interface Question {
  id: string;
  interviewId: string;
  questionText: string;
  questionNumber: number;
  isFollowUp: boolean;
  parentQuestionId?: string;
  createdAt: string;
  expectedPoints?: string[];
  modelAnswer?: string;
  answerText?: string;
  answeredAt?: Date;
  duration?: number;
  questionType?: string;
}

export interface Answer {
  id: string;
  questionId: string;
  answerText: string;
  createdAt: string;
}

export interface EvaluationDimension {
  name: string;
  label: string;
  score: number;
  description: string;
  evidence?: string[];
  missingEvidence?: string[];
}

export interface PointComparison {
  expectedPoint: string;
  status: 'covered' | 'partial' | 'missing' | 'not-covered';
  candidateEvidence?: string;
  evaluatorReason?: string;
  improvementPoint: string;
}

export interface Evaluation {
  id?: string;
  answerId?: string;
  // New dynamic format
  dimensions?: EvaluationDimension[];
  overallScore: number;
  pointComparison?: PointComparison[];
  // Old format (backward compatibility)
  technical?: number;
  communication?: number;
  leadership?: number;
  problemSolving?: number;
  confidence?: number;
  strengths: string[];
  weaknesses: string[];
  missingPoints?: string[];
  suggestions?: string[];
  improvements?: string[];
  createdAt?: string;
}

export interface QuestionWithDetails extends Question {
  answer?: Answer;
  evaluation?: Evaluation;
}

export interface InterviewReport {
  interview: Interview;
  questions: QuestionWithDetails[];
  averageScores: {
    technical: number;
    communication: number;
    leadership: number;
    problemSolving: number;
    confidence: number;
    overall: number;
  };
  summary: {
    strengths: string[];
    weaknesses: string[];
    improvements: string[];
  };
}

export interface CreateInterviewRequest {
  topic: string;
  difficulty: string;
  experience: number;
  numberOfQuestions: number;
  jobDescription?: string;
}

export const TOPICS = [
  'Node.js',
  'Angular',
  'React',
  'MongoDB',
  'TypeScript',
  'System Design',
  'Team Lead',
  'Engineering Manager',
  'HR Interview',
  'Custom Topic',
] as const;

export const DIFFICULTIES = ['Beginner', 'Intermediate', 'Advanced', 'Expert'] as const;

export const QUESTION_COUNTS = [5, 10, 15, 20] as const;

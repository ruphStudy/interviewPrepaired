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
}

export interface Answer {
  id: string;
  questionId: string;
  answerText: string;
  createdAt: string;
}

export interface Evaluation {
  id: string;
  answerId: string;
  technical: number;
  communication: number;
  leadership: number;
  problemSolving: number;
  confidence: number;
  strengths: string[];
  weaknesses: string[];
  missingPoints: string[];
  improvements: string[];
  createdAt: string;
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

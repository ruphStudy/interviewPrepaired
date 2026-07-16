export interface Interview {
  id: string;
  topic: string;
  difficulty: 'beginner' | 'intermediate' | 'advanced' | 'expert';
  experience: number;
  numberOfQuestions: number;
  jobDescription?: string;
  createdAt: string;
  completedAt?: string;
  status: 'created' | 'in-progress' | 'paused' | 'completed' | 'evaluated';
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

export interface InterviewReport {
  interview: Interview;
  questions: (Question & {
    answer?: Answer;
    evaluation?: Evaluation;
  })[];
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

export interface GenerateQuestionRequest {
  interviewId: string;
  previousQuestions?: string[];
  lastAnswer?: string;
  isFollowUp?: boolean;
}

export interface SubmitAnswerRequest {
  questionId: string;
  answerText: string;
}

export interface EvaluationResponse {
  technical: number;
  communication: number;
  leadership: number;
  problemSolving: number;
  confidence: number;
  strengths: string[];
  weaknesses: string[];
  missingPoints: string[];
  improvements: string[];
}

import OpenAI from 'openai';

// ============================================================================
// Enums & Types
// ============================================================================

export type InterviewTopic = string;

export enum DifficultyLevel {
  BEGINNER = 'beginner',
  INTERMEDIATE = 'intermediate',
  ADVANCED = 'advanced',
  EXPERT = 'expert',
}

export enum ExperienceLevel {
  STUDENT = 'student',
  ENTRY = 'entry',
  PROFESSIONAL = 'professional',
  SENIOR = 'senior',
  EXPERT = 'expert',
}

export enum InterviewStyle {
  TECHNICAL = 'technical',
  BEHAVIORAL = 'behavioral',
  HR = 'hr',
  LEADERSHIP = 'leadership',
  SITUATIONAL = 'situational',
  GENERAL = 'general',
}

export enum InterviewState {
  WELCOME = 'WELCOME',
  QUESTION = 'QUESTION',
  LISTENING = 'LISTENING',
  THINKING = 'THINKING',
  FOLLOWUP = 'FOLLOWUP',
  NEXT_QUESTION = 'NEXT_QUESTION',
  COMPLETED = 'COMPLETED',
}

// ============================================================================
// Interfaces
// ============================================================================

export interface InterviewSessionConfig {
  topic: string;
  difficulty: DifficultyLevel;
  experienceLevel: ExperienceLevel;
  interviewStyle: InterviewStyle;
  totalQuestions: number;
}

export interface SpeechMetrics {
  durationSeconds?: number;
  wordsPerMinute?: number;
  fillerWordCount?: number;
  pauseCount?: number;
}

export interface EvaluationDimension {
  name: string;
  label: string;
  score: number;
  description: string;
}

export interface DynamicEvaluationResponse {
  dimensions: EvaluationDimension[];
  overallScore: number;
  strengths: string[];
  weaknesses: string[];
  suggestions: string[];
  missingPoints: string[];
  speechMetrics?: SpeechMetrics;
}

export interface QuestionRequest {
  sessionConfig: InterviewSessionConfig;
  previousQuestions?: string[];
  jobDescription?: string;
}

export interface QuestionResponse {
  question: string;
  expectedPoints: string[];
  followUpTopics: string[];
  suggestedTimeLimit?: number;
}

export interface FollowUpQuestionRequest {
  sessionConfig: InterviewSessionConfig;
  originalQuestion: string;
  answer: string;
}

export interface FollowUpQuestionResponse {
  question: string;
  reason: string;
  challengeType: 'assumption' | 'depth' | 'experience' | 'alternative';
}

export interface EvaluationRequest {
  sessionConfig: InterviewSessionConfig;
  question: string;
  answer: string;
  speechMetrics?: SpeechMetrics;
}

export interface FinalReportRequest {
  sessionConfig: InterviewSessionConfig;
  evaluations: Array<{
    question: string;
    answer: string;
    evaluation: DynamicEvaluationResponse;
  }>;
}

export interface FinalReportResponse {
  overallScore: number;
  interviewReadinessScore: number;
  summary: string;
  recommendations: string[];
  strengthsOverview: string[];
  weaknessesOverview: string[];
  suggestedLearningPath: string[];
  recommendedNextTopics: string[];
  nextSteps: string[];
}

export interface PersonalityMessage {
  message: string;
  state: InterviewState;
}

// ============================================================================
// Configuration
// ============================================================================

interface OpenAIConfig {
  apiKey: string;
  model: string;
  maxRetries: number;
  timeout: number;
}

// ============================================================================
// OpenAI Service - Refactored
// ============================================================================

export class OpenAIService {
  private client: OpenAI;
  private config: OpenAIConfig;

  constructor() {
    const apiKey = process.env.OPENAI_API_KEY;
    
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY not found in environment variables');
    }

    this.config = {
      apiKey,
      model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
      maxRetries: 3,
      timeout: 60000,
    };

    console.log(`🔧 [OpenAIService] Initializing with model: ${this.config.model}`);

    this.client = new OpenAI({
      apiKey: this.config.apiKey,
      maxRetries: this.config.maxRetries,
      timeout: this.config.timeout,
    });
  }

  // ==========================================================================
  // Interview Personality Methods
  // ==========================================================================

  async generateWelcomeMessage(config: InterviewSessionConfig): Promise<PersonalityMessage> {
    const prompt = `Generate a professional, warm welcome message for a ${config.difficulty} level ${config.topic} interview.
Style: ${config.interviewStyle}
Experience: ${config.experienceLevel}

Keep it brief (1-2 sentences). Be encouraging and professional.

Return JSON: { "message": "..." }`;

    const response = await this.callOpenAI(prompt, 0.7, 150);
    return {
      message: response.message || `Welcome to your ${config.topic} interview. Let's begin.`,
      state: InterviewState.WELCOME,
    };
  }

  async generateTransitionMessage(): Promise<PersonalityMessage> {
    const messages = [
      'Thank you for your answer.',
      'I appreciate your response.',
      'That\'s an interesting perspective.',
      'Thank you for sharing that.',
    ];
    return {
      message: messages[Math.floor(Math.random() * messages.length)],
      state: InterviewState.NEXT_QUESTION,
    };
  }

  async generateThinkingMessage(): Promise<PersonalityMessage> {
    const messages = [
      'Let me think about that for a moment.',
      'Interesting. Let me process that.',
      'I see. Give me a moment.',
    ];
    return {
      message: messages[Math.floor(Math.random() * messages.length)],
      state: InterviewState.THINKING,
    };
  }

  async generateCompletionMessage(config: InterviewSessionConfig): Promise<PersonalityMessage> {
    const prompt = `Generate a brief, encouraging completion message for a ${config.topic} interview.
Keep it 1-2 sentences. Be positive and professional.

Return JSON: { "message": "..." }`;

    const response = await this.callOpenAI(prompt, 0.7, 150);
    return {
      message: response.message || 'Thank you for completing the interview. Your report is being generated.',
      state: InterviewState.COMPLETED,
    };
  }

  // ==========================================================================
  // Core Interview Methods
  // ==========================================================================

  async generateQuestion(request: QuestionRequest): Promise<QuestionResponse> {
    const systemPrompt = this.getQuestionSystemPrompt(request.sessionConfig);
    const userPrompt = this.getQuestionUserPrompt(request);

    const response = await this.callOpenAI(
      `${systemPrompt}\n\n${userPrompt}`,
      0.8,
      800
    );

    return {
      question: response.question,
      expectedPoints: response.expectedPoints || [],
      followUpTopics: response.followUpTopics || [],
      suggestedTimeLimit: response.suggestedTimeLimit,
    };
  }

  async generateFollowUpQuestion(request: FollowUpQuestionRequest): Promise<FollowUpQuestionResponse> {
    const systemPrompt = this.getFollowUpSystemPrompt(request.sessionConfig);
    const userPrompt = `Original Question: "${request.originalQuestion}"
Candidate's Answer: "${request.answer}"

Generate an intelligent follow-up that:
- Challenges assumptions or validates claims
- Tests deeper understanding
- Explores real experience or alternative approaches
- Is specific to their answer

Return JSON with: question, reason, challengeType (assumption/depth/experience/alternative)`;

    const response = await this.callOpenAI(
      `${systemPrompt}\n\n${userPrompt}`,
      0.8,
      500
    );

    return {
      question: response.question,
      reason: response.reason,
      challengeType: response.challengeType || 'depth',
    };
  }

  async evaluateAnswer(request: EvaluationRequest): Promise<DynamicEvaluationResponse> {
    const dimensions = this.getEvaluationDimensions(request.sessionConfig);
    const systemPrompt = this.getEvaluationSystemPrompt(request.sessionConfig, dimensions);
    
    const userPrompt = `Question: "${request.question}"
Answer: "${request.answer}"

Evaluate based on:
${dimensions.map(d => `- ${d.label}: ${d.description}`).join('\n')}

Return JSON with:
- dimensions: [{ name, label, score (0-10), description }]
- overallScore: weighted average
- strengths: [2-4 specific strengths]
- weaknesses: [2-4 areas for improvement]
- suggestions: [2-4 actionable suggestions]
- missingPoints: [key missing information]`;

    const response = await this.callOpenAI(
      `${systemPrompt}\n\n${userPrompt}`,
      0.3,
      1500
    );

    return {
      dimensions: response.dimensions || dimensions.map(d => ({ ...d, score: 5 })),
      overallScore: response.overallScore || 5,
      strengths: response.strengths || [],
      weaknesses: response.weaknesses || [],
      suggestions: response.suggestions || [],
      missingPoints: response.missingPoints || [],
      speechMetrics: request.speechMetrics,
    };
  }

  async generateFinalReport(request: FinalReportRequest): Promise<FinalReportResponse> {
    const systemPrompt = this.getFinalReportSystemPrompt(request.sessionConfig);
    const userPrompt = this.getFinalReportUserPrompt(request);

    const response = await this.callOpenAI(
      `${systemPrompt}\n\n${userPrompt}`,
      0.4,
      2000
    );

    const avgScore = this.calculateAverageScore(request.evaluations);

    return {
      overallScore: avgScore,
      interviewReadinessScore: response.interviewReadinessScore || avgScore,
      summary: response.summary || 'Interview performance summary unavailable.',
      recommendations: response.recommendations || [],
      strengthsOverview: response.strengthsOverview || [],
      weaknessesOverview: response.weaknessesOverview || [],
      suggestedLearningPath: response.suggestedLearningPath || [],
      recommendedNextTopics: response.recommendedNextTopics || [],
      nextSteps: response.nextSteps || [],
    };
  }

  // ==========================================================================
  // Dynamic Evaluation Dimensions
  // ==========================================================================

  private getEvaluationDimensions(config: InterviewSessionConfig): EvaluationDimension[] {
    const topic = config.topic.toLowerCase();
    const style = config.interviewStyle;

    // Technical roles
    if (this.isTechnicalTopic(topic) || style === InterviewStyle.TECHNICAL) {
      return [
        { name: 'technical', label: 'Technical Knowledge', score: 0, description: 'Accuracy and depth of technical knowledge' },
        { name: 'problemSolving', label: 'Problem Solving', score: 0, description: 'Analytical thinking and solution approach' },
        { name: 'communication', label: 'Communication', score: 0, description: 'Clarity in explaining technical concepts' },
        { name: 'confidence', label: 'Confidence', score: 0, description: 'Professional presentation and conviction' },
      ];
    }

    // Leadership roles
    if (this.isLeadershipTopic(topic) || style === InterviewStyle.LEADERSHIP) {
      return [
        { name: 'leadership', label: 'Leadership', score: 0, description: 'Decision-making and team guidance' },
        { name: 'communication', label: 'Communication', score: 0, description: 'Clarity and persuasiveness' },
        { name: 'conflictResolution', label: 'Conflict Resolution', score: 0, description: 'Handling disagreements effectively' },
        { name: 'strategicThinking', label: 'Strategic Thinking', score: 0, description: 'Long-term planning and vision' },
      ];
    }

    // Sales/Customer roles
    if (this.isSalesTopic(topic)) {
      return [
        { name: 'communication', label: 'Communication', score: 0, description: 'Clarity and persuasiveness' },
        { name: 'persuasion', label: 'Persuasion', score: 0, description: 'Ability to influence and convince' },
        { name: 'customerHandling', label: 'Customer Handling', score: 0, description: 'Managing customer relationships' },
        { name: 'confidence', label: 'Confidence', score: 0, description: 'Professional presence and conviction' },
      ];
    }

    // Teaching/Training roles
    if (this.isTeachingTopic(topic)) {
      return [
        { name: 'subjectKnowledge', label: 'Subject Knowledge', score: 0, description: 'Depth of subject expertise' },
        { name: 'communication', label: 'Communication', score: 0, description: 'Clarity in explanation' },
        { name: 'classroomManagement', label: 'Classroom Management', score: 0, description: 'Managing learning environment' },
        { name: 'studentEngagement', label: 'Student Engagement', score: 0, description: 'Keeping learners interested' },
      ];
    }

    // HR/Behavioral interviews
    if (style === InterviewStyle.HR || style === InterviewStyle.BEHAVIORAL) {
      return [
        { name: 'communication', label: 'Communication', score: 0, description: 'Clarity and articulation' },
        { name: 'cultureFit', label: 'Culture Fit', score: 0, description: 'Alignment with values' },
        { name: 'professionalism', label: 'Professionalism', score: 0, description: 'Professional maturity' },
        { name: 'motivation', label: 'Motivation', score: 0, description: 'Drive and enthusiasm' },
      ];
    }

    // Default/General
    return [
      { name: 'domainKnowledge', label: 'Domain Knowledge', score: 0, description: `Knowledge of ${config.topic}` },
      { name: 'communication', label: 'Communication', score: 0, description: 'Clarity and structure' },
      { name: 'problemSolving', label: 'Problem Solving', score: 0, description: 'Analytical approach' },
      { name: 'confidence', label: 'Confidence', score: 0, description: 'Professional presentation' },
    ];
  }

  private isTechnicalTopic(topic: string): boolean {
    const techKeywords = ['developer', 'engineer', 'programmer', 'software', 'web', 'mobile', 'data', 'cloud', 'devops', 'qa', 'testing', 'node', 'react', 'angular', 'python', 'java'];
    return techKeywords.some(keyword => topic.includes(keyword));
  }

  private isLeadershipTopic(topic: string): boolean {
    const leaderKeywords = ['manager', 'lead', 'director', 'executive', 'ceo', 'cto', 'head', 'chief', 'supervisor'];
    return leaderKeywords.some(keyword => topic.includes(keyword));
  }

  private isSalesTopic(topic: string): boolean {
    const salesKeywords = ['sales', 'marketing', 'account', 'business development', 'customer success'];
    return salesKeywords.some(keyword => topic.includes(keyword));
  }

  private isTeachingTopic(topic: string): boolean {
    const teachKeywords = ['teacher', 'instructor', 'trainer', 'professor', 'educator', 'tutor'];
    return teachKeywords.some(keyword => topic.includes(keyword));
  }

  // ==========================================================================
  // System Prompts
  // ==========================================================================

  private getQuestionSystemPrompt(config: InterviewSessionConfig): string {
    return `You are a PROFESSIONAL INTERVIEWER conducting a ${config.interviewStyle} interview for: ${config.topic}

Interview Context:
- Difficulty: ${config.difficulty}
- Experience Level: ${config.experienceLevel}
- Style: ${config.interviewStyle}

Generate ONE realistic, practical question that:
- Matches ${config.difficulty} difficulty
- Suitable for ${config.experienceLevel} candidates
- Follows ${config.interviewStyle} interview style
- Tests real competencies in ${config.topic}
- Is clear, specific, and professionally appropriate

Return JSON: { "question", "expectedPoints": [], "followUpTopics": [], "suggestedTimeLimit": seconds }`;
  }

  private getFollowUpSystemPrompt(config: InterviewSessionConfig): string {
    return `You are conducting a ${config.interviewStyle} interview for ${config.topic} at ${config.difficulty} level.

Generate intelligent follow-up questions that:
- Challenge assumptions made by the candidate
- Test claims with specific examples ("How exactly?", "What metrics?")
- Explore real experience ("Walk me through...", "Describe a time when...")
- Test deeper understanding beyond surface answers
- Validate technical accuracy or approach

Be professional but probing.`;
  }

  private getEvaluationSystemPrompt(config: InterviewSessionConfig, dimensions: EvaluationDimension[]): string {
    return `You are an EXPERT EVALUATOR for ${config.topic} interviews.

Context:
- Topic: ${config.topic}
- Difficulty: ${config.difficulty}
- Experience Level: ${config.experienceLevel}
- Style: ${config.interviewStyle}

Evaluation Dimensions:
${dimensions.map(d => `- ${d.label}: ${d.description}`).join('\n')}

Rate 0-10 for each dimension. Be fair, objective, and constructive.
Consider the candidate's level (${config.experienceLevel}) when evaluating.`;
  }

  private getFinalReportSystemPrompt(config: InterviewSessionConfig): string {
    return `You are an EXPERT CAREER COACH for ${config.topic}.

Create a comprehensive final report including:
- Overall Performance Summary (2-3 paragraphs)
- Key Strengths (3-5 points)
- Areas for Improvement (3-5 points)
- Specific Learning Path (3-5 topics to study)
- Recommended Next Topics (2-4 related areas)
- Interview Readiness Score (0-10)
- Actionable Next Steps (3-5 specific actions)

Be encouraging yet honest. Make feedback specific to ${config.topic}.`;
  }

  // ==========================================================================
  // User Prompts
  // ==========================================================================

  private getQuestionUserPrompt(request: QuestionRequest): string {
    let prompt = `Generate a ${request.sessionConfig.difficulty} level question for ${request.sessionConfig.topic}.\n`;
    prompt += `Candidate: ${request.sessionConfig.experienceLevel}\n`;
    prompt += `Style: ${request.sessionConfig.interviewStyle}\n\n`;

    if (request.previousQuestions?.length) {
      prompt += `Previously asked (avoid duplicates):\n${request.previousQuestions.map((q, i) => `${i + 1}. ${q}`).join('\n')}\n\n`;
    }

    if (request.jobDescription) {
      prompt += `Job Context: ${request.jobDescription}\n\n`;
    }

    prompt += `Generate a NEW, DIFFERENT question.`;
    return prompt;
  }

  private getFinalReportUserPrompt(request: FinalReportRequest): string {
    const { sessionConfig, evaluations } = request;
    
    let prompt = `Interview Summary:
Topic: ${sessionConfig.topic}
Difficulty: ${sessionConfig.difficulty}
Experience: ${sessionConfig.experienceLevel}
Style: ${sessionConfig.interviewStyle}
Questions: ${evaluations.length}

Performance by Question:\n`;

    evaluations.forEach((item, i) => {
      prompt += `\nQ${i + 1}: ${item.question}\n`;
      prompt += `A: ${item.answer.substring(0, 150)}...\n`;
      prompt += `Score: ${item.evaluation.overallScore}/10\n`;
    });

    const avgScore = this.calculateAverageScore(evaluations);
    prompt += `\nAverage Score: ${avgScore.toFixed(1)}/10\n\n`;
    prompt += `Generate comprehensive final report with all requested sections.`;

    return prompt;
  }

  // ==========================================================================
  // Helper Methods
  // ==========================================================================

  private async callOpenAI(prompt: string, temperature: number, maxTokens: number): Promise<any> {
    try {
      const response = await this.client.chat.completions.create({
        model: this.config.model,
        messages: [{ role: 'user', content: prompt }],
        temperature,
        max_tokens: maxTokens,
        response_format: { type: 'json_object' },
      });

      const content = response.choices[0]?.message?.content;
      if (!content) throw new Error('No response from OpenAI');

      return JSON.parse(content);
    } catch (error: any) {
      console.error('[OpenAIService] Error:', error.message);
      throw new Error(`OpenAI API error: ${error.message}`);
    }
  }

  private calculateAverageScore(evaluations: Array<{ evaluation: DynamicEvaluationResponse }>): number {
    if (!evaluations.length) return 0;
    const sum = evaluations.reduce((acc, e) => acc + e.evaluation.overallScore, 0);
    return Math.round((sum / evaluations.length) * 10) / 10;
  }

  // ==========================================================================
  // Utility Methods
  // ==========================================================================

  async testConnection(): Promise<boolean> {
    try {
      await this.client.chat.completions.create({
        model: this.config.model,
        messages: [{ role: 'user', content: 'test' }],
        max_tokens: 5,
      });
      return true;
    } catch {
      return false;
    }
  }

  getConfig(): Readonly<OpenAIConfig> {
    return { ...this.config };
  }
}

// ============================================================================
// Singleton Export
// ============================================================================

let instance: OpenAIService | null = null;

export const getOpenAIService = (): OpenAIService => {
  if (!instance) instance = new OpenAIService();
  return instance;
};

export default OpenAIService;

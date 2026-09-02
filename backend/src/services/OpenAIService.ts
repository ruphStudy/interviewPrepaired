import OpenAI from 'openai';
import { normalizeScore, normalizeEvaluationDimensions } from '../utils/scoreNormalization';
import { recordAIUsage } from './AIUsageService';
import { getLanguageInstruction, getMaxTokensForLanguage } from '../config/languages';

/** Optional per-call context for AI cost attribution — omit for calls with no specific interview (e.g. connectivity checks). */
export interface AIUsageContext {
  interviewId?: string;
  operation: string;
  questionIndex?: number;
}

/**
 * Optional out-parameter populated by callOpenAI with the real usage/model
 * metadata from that exact request. Deliberately a per-call object (not
 * shared instance state) so concurrent calls on the shared OpenAIService
 * singleton can never clobber each other's metadata. Used by OpenAIProvider
 * (backend/src/ai/providers) to expose AIResponseMetadata without a second
 * OpenAI request, a new usage-persistence path, or any change to the
 * existing public method return types.
 */
export interface AICallMetadataSink {
  current?: {
    model: string;
    promptTokens: number;
    cachedTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

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

export enum QuestionType {
  FUNDAMENTALS = 'fundamentals',
  TECHNICAL_CONCEPT = 'technical-concept',
  PRACTICAL_USAGE = 'practical-usage',
  COMPARISON = 'comparison',
  CODING = 'coding',
  DEBUGGING = 'debugging',
  SCENARIO = 'scenario',
  SYSTEM_DESIGN = 'system-design',
  BEHAVIORAL = 'behavioral',
  LEADERSHIP = 'leadership',
  ARCHITECTURE = 'architecture',
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
  evidence?: string[]; // NEW: Specific evidence supporting this score
  missingEvidence?: string[]; // NEW: What evidence is missing for higher score
}

export interface DynamicEvaluationResponse {
  dimensions: EvaluationDimension[];
  overallScore: number;
  strengths: string[];
  weaknesses: string[];
  suggestions: string[];
  missingPoints: string[];
  pointComparison?: PointComparison[];
  speechMetrics?: SpeechMetrics;
}

export interface PointComparison {
  expectedPoint: string;
  status: 'covered' | 'partial' | 'missing' | 'incorrect';
  candidateEvidence: string;
  evaluatorReason: string;
  improvementPoint: string;
}

export interface QuestionRequest {
  sessionConfig: InterviewSessionConfig;
  previousQuestions?: string[];
  jobDescription?: string;
  memoryContext?: string; // NEW: Interview memory context for continuity
  coverageContext?: string; // NEW: Competency coverage tracking
  priorityCompetency?: string; // NEW: Competency to prioritize (least covered)
  difficultyContext?: string; // NEW: Adaptive difficulty information
  interviewId?: string; // For AI cost attribution
  interviewLanguage?: string;
}

export interface QuestionResponse {
  question: string;
  questionType?: QuestionType;
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
  expectedPoints?: string[];
  referenceAnswer?: string; // Uploaded reference answer — evaluate semantic correctness against this, not exact wording
  speechMetrics?: SpeechMetrics;
  interviewId?: string; // For AI cost attribution
  questionIndex?: number;
  interviewLanguage?: string;
}

export interface FinalReportRequest {
  sessionConfig: InterviewSessionConfig;
  evaluations: Array<{
    question: string;
    answer: string;
    evaluation: DynamicEvaluationResponse;
  }>;
  interviewId?: string; // For AI cost attribution
  interviewLanguage?: string;
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

export interface BlueprintCompetency {
  name: string;
  description: string;
  weight: number;
}

export interface BlueprintGenerationRequest {
  topic: string;
  roleName?: string;
  industry?: string;
  difficulty: DifficultyLevel | string;
  experienceLevel: ExperienceLevel | string;
  interviewStyle: InterviewStyle | string;
}

export interface BlueprintGenerationResponse {
  competencies: BlueprintCompetency[];
  evaluationRules: string;
  questionStrategy: string;
  reportStrategy: string;
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
      "That's an interesting perspective.",
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
  // Blueprint Generation
  // ==========================================================================

  /**
   * Generate dynamic interview blueprint with profession-specific competencies
   * This is the foundation for the entire interview process
   */
  async generateInterviewBlueprint(request: BlueprintGenerationRequest, metadataSink?: AICallMetadataSink): Promise<BlueprintGenerationResponse> {
    console.log('[OpenAIService] Generating interview blueprint for:', request);

    const roleDescription = this.buildRoleDescription(request);
    
    const prompt = `You are an expert interview designer and organizational psychologist.

Your task: Create a comprehensive interview blueprint for evaluating candidates.

${roleDescription}

REQUIREMENTS:

1. Generate 4 to 6 competencies that are SPECIFIC to this role and industry
2. Each competency must have:
   - name: Clear, concise competency name (e.g., "Technical Problem Solving", "Customer Relationship Management")
   - description: Detailed explanation of what this competency measures (50-200 words)
   - weight: Importance percentage (all weights must total EXACTLY 100)

3. Competencies must be:
   - Profession-specific (NOT generic)
   - Measurable through interview questions
   - Relevant to ${request.difficulty} level candidates
   - Appropriate for ${request.experienceLevel} experience level

4. Generate evaluation rules: Detailed guidelines on HOW to evaluate answers against these competencies

5. Generate question strategy: What types of questions to ask to assess these competencies

6. Generate report strategy: How to structure the final report for this profession

IMPORTANT:
- Competency weights MUST total exactly 100
- Competencies must be unique and non-overlapping
- Focus on profession-specific skills, not generic soft skills
- Consider the industry context: ${request.industry || 'general'}

EXAMPLES OF GOOD COMPETENCIES:

For Sales Executive:
- "Consultative Selling" (25%)
- "Negotiation & Closing" (25%)
- "Customer Relationship Building" (20%)
- "Product Knowledge & Positioning" (15%)
- "Objection Handling" (15%)

For Nurse:
- "Clinical Assessment Skills" (30%)
- "Patient Communication & Empathy" (25%)
- "Emergency Response" (20%)
- "Medical Knowledge" (15%)
- "Team Collaboration" (10%)

For Node.js Developer:
- "Backend Architecture Design" (30%)
- "API Development & RESTful Services" (25%)
- "Database Design & Optimization" (20%)
- "Code Quality & Testing" (15%)
- "Problem Solving & Debugging" (10%)

Return ONLY valid JSON in this exact format:
{
  "competencies": [
    {
      "name": "Competency Name",
      "description": "Detailed description of what this competency measures and why it matters for this role...",
      "weight": 25
    }
  ],
  "evaluationRules": "Detailed guidelines on how to evaluate answers. Include scoring criteria, what to look for in strong vs weak answers, and how to identify missing competencies...",
  "questionStrategy": "Guidelines on what types of questions to ask, how to structure the interview, what scenarios to present, and how to probe for competency evidence...",
  "reportStrategy": "How to structure the final report, what metrics to highlight, how to present strengths and weaknesses, and what recommendations to provide for this profession..."
}`;

    try {
      const response = await this.callOpenAI(prompt, 0.7, 2000, undefined, metadataSink);

      // Validate response structure
      if (!response.competencies || !Array.isArray(response.competencies)) {
        throw new Error('Invalid blueprint response: missing or invalid competencies array');
      }

      if (!response.evaluationRules || !response.questionStrategy || !response.reportStrategy) {
        throw new Error('Invalid blueprint response: missing required fields');
      }

      // Normalize weights to ensure they total exactly 100
      const totalWeight = response.competencies.reduce((sum: number, comp: BlueprintCompetency) => sum + comp.weight, 0);
      if (Math.abs(totalWeight - 100) > 0.01) {
        console.warn('[OpenAIService] Weights did not total 100, normalizing...');
        const factor = 100 / totalWeight;
        response.competencies = response.competencies.map((comp: BlueprintCompetency) => ({
          ...comp,
          weight: Math.round(comp.weight * factor * 100) / 100,
        }));
        
        // Fix any rounding errors by adjusting the last competency
        const newTotal = response.competencies.reduce((sum: number, comp: BlueprintCompetency) => sum + comp.weight, 0);
        if (Math.abs(newTotal - 100) > 0.01) {
          response.competencies[response.competencies.length - 1].weight += (100 - newTotal);
        }
      }

      console.log('[OpenAIService] Blueprint generated successfully with competencies:', 
        response.competencies.map((c: BlueprintCompetency) => `${c.name} (${c.weight}%)`).join(', '));

      return response as BlueprintGenerationResponse;

    } catch (error) {
      console.error('[OpenAIService] Blueprint generation failed:', error);
      throw new Error(`Failed to generate interview blueprint: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Build role description for blueprint generation
   */
  private buildRoleDescription(request: BlueprintGenerationRequest): string {
    const parts: string[] = [];

    parts.push(`Role/Position: ${request.topic}`);
    
    if (request.roleName) {
      parts.push(`Specific Role Title: ${request.roleName}`);
    }
    
    if (request.industry) {
      parts.push(`Industry: ${request.industry}`);
    }
    
    parts.push(`Difficulty Level: ${request.difficulty}`);
    parts.push(`Experience Level: ${request.experienceLevel}`);
    parts.push(`Interview Style: ${request.interviewStyle}`);

    return parts.join('\n');
  }

  // ==========================================================================
  // Core Interview Methods
  // ==========================================================================

  /**
   * Get appropriate question types for experience level
   */
  private getAppropriateQuestionTypes(experienceLevel: ExperienceLevel, interviewStyle: InterviewStyle): QuestionType[] {
    const types: QuestionType[] = [];

    // Fresher / Beginner (student, entry)
    if (experienceLevel === ExperienceLevel.STUDENT || experienceLevel === ExperienceLevel.ENTRY) {
      types.push(
        QuestionType.FUNDAMENTALS,
        QuestionType.TECHNICAL_CONCEPT,
        QuestionType.PRACTICAL_USAGE,
        QuestionType.COMPARISON,
        QuestionType.CODING,
        QuestionType.DEBUGGING,
        QuestionType.BEHAVIORAL
      );
    }
    // Junior / Mid-level (professional)
    else if (experienceLevel === ExperienceLevel.PROFESSIONAL) {
      types.push(
        QuestionType.TECHNICAL_CONCEPT,
        QuestionType.PRACTICAL_USAGE,
        QuestionType.COMPARISON,
        QuestionType.CODING,
        QuestionType.DEBUGGING,
        QuestionType.SCENARIO,
        QuestionType.BEHAVIORAL
      );
    }
    // Senior
    else if (experienceLevel === ExperienceLevel.SENIOR) {
      types.push(
        QuestionType.SCENARIO,
        QuestionType.SYSTEM_DESIGN,
        QuestionType.CODING,
        QuestionType.DEBUGGING,
        QuestionType.COMPARISON,
        QuestionType.BEHAVIORAL,
        QuestionType.LEADERSHIP
      );
    }
    // Tech Lead / Expert
    else if (experienceLevel === ExperienceLevel.EXPERT) {
      types.push(
        QuestionType.ARCHITECTURE,
        QuestionType.SYSTEM_DESIGN,
        QuestionType.SCENARIO,
        QuestionType.LEADERSHIP,
        QuestionType.BEHAVIORAL
      );
    }

    // Style-specific additions
    if (interviewStyle === InterviewStyle.LEADERSHIP) {
      if (experienceLevel !== ExperienceLevel.STUDENT && experienceLevel !== ExperienceLevel.ENTRY) {
        types.push(QuestionType.LEADERSHIP);
      }
    }

    return types;
  }

  async generateQuestion(request: QuestionRequest, metadataSink?: AICallMetadataSink): Promise<QuestionResponse> {
    const appropriateTypes = this.getAppropriateQuestionTypes(
      request.sessionConfig.experienceLevel,
      request.sessionConfig.interviewStyle
    );

    const systemPrompt = `${this.getQuestionSystemPrompt(request.sessionConfig, appropriateTypes)}\n\n${getLanguageInstruction(request.interviewLanguage)}`;
    const userPrompt = this.getQuestionUserPrompt(request);

    const response = await this.callOpenAI(
      `${systemPrompt}\n\n${userPrompt}`,
      0.8,
      getMaxTokensForLanguage(800, request.interviewLanguage),
      { interviewId: request.interviewId, operation: 'question-generation' },
      metadataSink
    );

    return {
      question: response.question,
      questionType: response.questionType as QuestionType,
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

  async evaluateAnswer(request: EvaluationRequest, metadataSink?: AICallMetadataSink): Promise<DynamicEvaluationResponse> {
    const dimensions = this.getEvaluationDimensions(request.sessionConfig);
    const systemPrompt = `${this.getEvaluationSystemPrompt(request.sessionConfig, dimensions)}

${getLanguageInstruction(request.interviewLanguage)}
The candidate's answer may be in this language, English, or a natural code-mix of both — understand it regardless of which. Write all descriptive text fields (dimension "label" and "description", "evidence", "missingEvidence", "strengths", "weaknesses", "suggestions", "missingPoints", and pointComparison text fields) in the selected language. Keep dimension "name" values and the "status" enum values (covered/partial/missing/incorrect) exactly as specified in English — they are internal identifiers, not display text. Numeric scores are unaffected by language.`;
    
    const expectedPointsSection = request.expectedPoints && request.expectedPoints.length > 0
      ? `

Expected Points to Cover:
${request.expectedPoints.map((pt, i) => `${i + 1}. ${pt}`).join('\n')}

For EACH expected point, compare against the candidate answer:
- status: "covered" (clearly explained), "partial" (mentioned but incomplete), "missing" (not addressed), "incorrect" (technically wrong)
- candidateEvidence: exact quote or paraphrase from answer (empty string if missing)
- evaluatorReason: brief explanation of the status
- improvementPoint: specific suggestion to improve this point

RETURN pointComparison array with each expected point.`
      : '';

    const referenceAnswerSection = request.referenceAnswer
      ? `

Reference Answer: "${request.referenceAnswer}"
This reference answer represents the expected content. Evaluate semantic correctness, not exact wording. The candidate may give an equally correct answer using different terminology/examples. Do NOT give a perfect score just because the candidate reuses matching words, and do NOT penalize different wording when it is technically correct.`
      : '';

    const userPrompt = `Question: "${request.question}"
Answer: "${request.answer}"${expectedPointsSection}${referenceAnswerSection}

Evaluate based on:
${dimensions.map(d => `- ${d.label}: ${d.description}`).join('\n')}

IMPORTANT: For EACH dimension, provide:
1. Score (0-10)
2. Evidence: Specific quotes or behaviors from the answer that justify the score
3. Missing Evidence: What was missing or could have been better for a higher score

Return JSON with:
- dimensions: [{ 
    name, 
    label, 
    score (0-10), 
    description,
    evidence: ["specific quote 1", "specific behavior 2"],
    missingEvidence: ["what's missing 1", "what's missing 2"]
  }]
- pointComparison: [{
    expectedPoint: string,
    status: "covered" | "partial" | "missing" | "incorrect",
    candidateEvidence: string,
    evaluatorReason: string,
    improvementPoint: string
  }] (only if expected points provided)
- overallScore: weighted average
- strengths: [2-4 specific strengths with evidence]
- weaknesses: [2-4 areas for improvement]
- suggestions: [2-4 actionable suggestions]
- missingPoints: [key missing information]

EXAMPLE:
{
  "dimensions": [
    {
      "name": "leadership",
      "label": "Leadership",
      "score": 7,
      "description": "Team management",
      "evidence": ["Mentioned leading team of 5", "Described delegation strategy"],
      "missingEvidence": ["No conflict resolution examples", "Lacked metrics on team performance"]
    }
  ],
  "pointComparison": [
    {
      "expectedPoint": "Explain delegation strategy",
      "status": "covered",
      "candidateEvidence": "I assign tasks based on team strengths",
      "evaluatorReason": "Clearly described delegation approach",
      "improvementPoint": "Could add specific example"
    }
  ]
}`

    const response = await this.callOpenAI(
      `${systemPrompt}\n\n${userPrompt}`,
      0.3,
      getMaxTokensForLanguage(1500, request.interviewLanguage),
      { interviewId: request.interviewId, operation: 'answer-evaluation', questionIndex: request.questionIndex },
      metadataSink
    );

    // Normalize dimensions and scores
    const normalizedDimensions = response.dimensions 
      ? normalizeEvaluationDimensions(response.dimensions)
      : dimensions.map(d => ({ ...d, score: 5 }));
    
    const normalizedOverallScore = normalizeScore(response.overallScore, 5, 0, 10);

    return {
      dimensions: normalizedDimensions,
      overallScore: normalizedOverallScore,
      strengths: response.strengths || [],
      weaknesses: response.weaknesses || [],
      suggestions: response.suggestions || [],
      missingPoints: response.missingPoints || [],
      pointComparison: response.pointComparison || [],
      speechMetrics: request.speechMetrics,
    };
  }

  async generateFinalReport(request: FinalReportRequest, metadataSink?: AICallMetadataSink): Promise<FinalReportResponse> {
    const systemPrompt = `${this.getFinalReportSystemPrompt(request.sessionConfig)}

${getLanguageInstruction(request.interviewLanguage)}
Write "summary", "recommendations", "strengthsOverview", "weaknessesOverview", and "nextSteps" in the selected language. Numeric scores are unaffected by language. Do not translate technical product/model names.`;
    const userPrompt = this.getFinalReportUserPrompt(request);

    const response = await this.callOpenAI(
      `${systemPrompt}\n\n${userPrompt}`,
      0.4,
      getMaxTokensForLanguage(2000, request.interviewLanguage),
      { interviewId: request.interviewId, operation: 'final-report-generation' },
      metadataSink
    );

    const avgScore = this.calculateAverageScore(request.evaluations);
    
    // Normalize scores - use ?? instead of || to preserve valid 0 scores
    const normalizedOverallScore = normalizeScore(avgScore, 0, 0, 10);
    const normalizedReadinessScore = normalizeScore(
      response.interviewReadinessScore ?? avgScore,
      avgScore,
      0,
      10
    );

    return {
      overallScore: normalizedOverallScore,
      interviewReadinessScore: normalizedReadinessScore,
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
  // Model Answer Generation
  // ==========================================================================

  /**
   * Generate an ideal model answer for a question (for learning purposes)
   *
   * This is the spoken-form ideal candidate answer, NOT the bullet-point
   * `keyPointsExpected` list — the prompt must stay paragraph-form and must
   * never echo evaluation criteria/skill names as bullets (that's what
   * `keyPointsExpected` is for).
   */
  async generateModelAnswer(params: {
    question: string;
    topic: string;
    difficulty: string;
    experienceLevel: string;
    expectedPoints?: string[];
    questionType?: QuestionType;
    interviewId?: string;
    questionIndex?: number;
    interviewLanguage?: string;
  }, metadataSink?: AICallMetadataSink): Promise<string> {
    const prompt = `You are generating the ideal answer a strong candidate would give verbally in a real ${params.topic} technical interview.

${getLanguageInstruction(params.interviewLanguage)}

Question: "${params.question}"
Topic: ${params.topic}
Experience level: ${params.experienceLevel}
Difficulty: ${params.difficulty}

Return a complete, natural interview response in paragraph form.

Do NOT return:
- bullet points
- numbered lists
- evaluation criteria
- skill names
- phrases like "Understanding of", "Ability to", "Candidate should know", "Key points include"
- headings
- keywords only

Answer the interview question directly as if you are the candidate. Use full sentences and natural, professional spoken language in the selected language. Include explanation, comparison, and concrete examples where useful.

The answer should be concise but complete, generally around 100–250 words depending on complexity. Adapt the depth to the topic, experience level, and difficulty. For senior/leadership questions, include trade-offs and practical context where appropriate.

Return strict JSON:
{
  "answer": "complete paragraph-form ideal candidate answer"
}`;

    try {
      const response = await this.callOpenAI(prompt, 0.7, getMaxTokensForLanguage(500, params.interviewLanguage), {
        interviewId: params.interviewId,
        operation: 'model-answer-generation',
        questionIndex: params.questionIndex,
      }, metadataSink);

      // Validate the expected { "answer": "..." } shape — a falsy-but-present
      // empty string, a non-string `answer`, or a missing field must never
      // fall through to a stringified-object/placeholder "answer".
      const candidate = response && typeof response === 'object' ? (response as { answer?: unknown }).answer : undefined;

      if (typeof candidate === 'string' && candidate.trim().length > 0) {
        return candidate.trim();
      }

      console.error('[OpenAIService] generateModelAnswer: invalid response shape', {
        hasResponse: !!response,
        responseType: typeof response,
        hasAnswerField: !!(response && typeof response === 'object' && 'answer' in response),
      });
      throw new Error('generateModelAnswer: OpenAI response did not contain a valid non-empty "answer" string');
    } catch (error) {
      // Never mask a failure with a fake placeholder answer — propagate so
      // the caller's existing non-critical try/catch logs it and leaves
      // modelAnswer genuinely unset instead of storing garbage.
      console.error('[OpenAIService] Failed to generate model answer:', error);
      throw error;
    }
  }

  // ==========================================================================
  // System Prompts
  // ==========================================================================

  private getQuestionSystemPrompt(config: InterviewSessionConfig, appropriateTypes: QuestionType[]): string {
    const typesList = appropriateTypes.join(', ');
    
    return `You are a PROFESSIONAL INTERVIEWER conducting a ${config.interviewStyle} interview for: ${config.topic}

Interview Context:
- Difficulty: ${config.difficulty}
- Experience Level: ${config.experienceLevel}
- Style: ${config.interviewStyle}

QUESTION TYPE CONSTRAINTS:
For ${config.experienceLevel} level, use ONLY these question types:
${appropriateTypes.map(t => `- ${t}`).join('\n')}

DO NOT generate:
${config.experienceLevel === ExperienceLevel.STUDENT || config.experienceLevel === ExperienceLevel.ENTRY 
  ? '- Leadership questions\n- Advanced system-design questions\n- Architecture questions' 
  : config.experienceLevel === ExperienceLevel.PROFESSIONAL
  ? '- Advanced architecture questions\n- Executive leadership questions'
  : ''}

Generate ONE realistic, practical question that:
- Matches ${config.difficulty} difficulty
- Suitable for ${config.experienceLevel} candidates
- Follows ${config.interviewStyle} interview style
- Uses one of these types: ${typesList}
- Tests real competencies in ${config.topic}
- Is clear, specific, and professionally appropriate

Return JSON: { "question", "questionType": "${typesList.split(',')[0]}", "expectedPoints": [], "followUpTopics": [], "suggestedTimeLimit": seconds }`;
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

    // NEW: Include adaptive difficulty context
    if (request.difficultyContext) {
      prompt += `=== ADAPTIVE DIFFICULTY STATUS ===\n`;
      prompt += request.difficultyContext;
      prompt += `\n=== END OF DIFFICULTY INFO ===\n\n`;
    }

    // NEW: Include competency coverage context
    if (request.coverageContext) {
      prompt += `=== COMPETENCY ASSESSMENT PROGRESS ===\n`;
      prompt += request.coverageContext;
      prompt += `\n\n=== END OF COVERAGE ===\n\n`;
    }
    
    // NEW: Priority competency guidance
    if (request.priorityCompetency) {
      prompt += `⚠️ IMPORTANT: Focus the next question on assessing "${request.priorityCompetency}" competency.\n`;
      prompt += `This competency has the lowest coverage and needs more assessment.\n\n`;
    }

    // NEW: Include interview memory context
    if (request.memoryContext) {
      prompt += `=== WHAT WE'VE LEARNED ABOUT THE CANDIDATE SO FAR ===\n`;
      prompt += request.memoryContext;
      prompt += `\n\n=== END OF CANDIDATE INFORMATION ===\n\n`;
      prompt += `IMPORTANT: Reference the information above in your question to create continuity.\n`;
      prompt += `Examples:\n`;
      prompt += `- "You mentioned managing 20 people. What was your biggest challenge?"\n`;
      prompt += `- "Earlier you talked about the X project. How did you handle...?"\n`;
      prompt += `- "You said you increased revenue by 40%. Walk me through your strategy..."\n\n`;
    }

    if (request.previousQuestions?.length) {
      prompt += `Previously asked (avoid duplicates):\n${request.previousQuestions.map((q, i) => `${i + 1}. ${q}`).join('\n')}\n\n`;
    }

    if (request.jobDescription) {
      prompt += `Job Context: ${request.jobDescription}\n\n`;
    }

    prompt += `Generate a NEW, DIFFERENT question`;
    if (request.priorityCompetency) {
      prompt += ` that specifically assesses "${request.priorityCompetency}" competency`;
    }
    if (request.memoryContext) {
      prompt += ` that references or builds upon the candidate's previous answers`;
    }
    prompt += `.`;
    
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

  /**
   * Call OpenAI API with JSON response format
   * Made public for use by other services (e.g., InterviewMemoryService)
   */
  async callOpenAI(prompt: string, temperature: number, maxTokens: number, usageContext?: AIUsageContext, metadataSink?: AICallMetadataSink): Promise<any> {
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

      // Expose this exact request's real metadata to the caller (e.g.
      // OpenAIProvider) via the out-param, independent of cost tracking below.
      if (metadataSink) {
        metadataSink.current = {
          model: response.model || this.config.model,
          promptTokens: response.usage?.prompt_tokens ?? 0,
          cachedTokens: response.usage?.prompt_tokens_details?.cached_tokens ?? 0,
          completionTokens: response.usage?.completion_tokens ?? 0,
          totalTokens: response.usage?.total_tokens ?? 0,
        };
      }

      // Record ACTUAL usage from this real response — never estimated. Awaited
      // before returning so a final-report call's cost is durably persisted
      // before its caller can build/return the completed report.
      if (usageContext?.interviewId && response.usage) {
        await recordAIUsage({
          interviewId: usageContext.interviewId,
          operation: usageContext.operation,
          questionIndex: usageContext.questionIndex,
          model: response.model || this.config.model,
          promptTokens: response.usage.prompt_tokens,
          cachedTokens: response.usage.prompt_tokens_details?.cached_tokens ?? 0,
          completionTokens: response.usage.completion_tokens,
          totalTokens: response.usage.total_tokens,
        });
      }

      return this.safeParseJSON(content);
    } catch (error: any) {
      console.error('[OpenAIService] Error:', error.message);
      throw new Error(`OpenAI API error: ${error.message}`);
    }
  }

  /**
   * Safely parse JSON with fallback handling for common AI response issues
   */
  private safeParseJSON(content: string): any {
    try {
      // Try direct parse first
      return JSON.parse(content);
    } catch (error) {
      console.warn('[OpenAIService] Direct JSON parse failed, attempting cleanup...');
      
      // Remove markdown code fences if present
      let cleaned = content.replace(/```json\s*/g, '').replace(/```\s*/g, '');
      
      // Remove leading/trailing whitespace
      cleaned = cleaned.trim();
      
      // Try parsing cleaned content
      try {
        return JSON.parse(cleaned);
      } catch (cleanError) {
        console.error('[OpenAIService] JSON parse failed even after cleanup');
        console.error('[OpenAIService] Content:', content.substring(0, 200));
        throw new Error('Failed to parse AI response as JSON');
      }
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

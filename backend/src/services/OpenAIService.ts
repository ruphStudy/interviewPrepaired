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
  speechMetrics?: SpeechMetrics;
}

export interface QuestionRequest {
  sessionConfig: InterviewSessionConfig;
  previousQuestions?: string[];
  jobDescription?: string;
  memoryContext?: string; // NEW: Interview memory context for continuity
  coverageContext?: string; // NEW: Competency coverage tracking
  priorityCompetency?: string; // NEW: Competency to prioritize (least covered)
  difficultyContext?: string; // NEW: Adaptive difficulty information
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
  async generateInterviewBlueprint(request: BlueprintGenerationRequest): Promise<BlueprintGenerationResponse> {
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
      const response = await this.callOpenAI(prompt, 0.7, 2000);
      
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
  ]
}`;

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
  // Model Answer Generation
  // ==========================================================================

  /**
   * Generate an ideal model answer for a question (for learning purposes)
   */
  async generateModelAnswer(params: {
    question: string;
    topic: string;
    difficulty: string;
    experienceLevel: string;
    expectedPoints?: string[];
  }): Promise<string> {
    const systemPrompt = `You are an expert ${params.topic} professional writing a model answer for educational purposes.

Create a comprehensive, well-structured answer that demonstrates:
- Deep understanding of the topic
- Practical experience and real-world application
- Clear communication and technical accuracy
- Appropriate detail for ${params.difficulty} ${params.experienceLevel} level

Keep it conversational but professional, as if answering in an interview.`;

    const expectedPointsSection = params.expectedPoints && params.expectedPoints.length > 0
      ? `\n\nKey Points to Cover:\n${params.expectedPoints.map(p => `- ${p}`).join('\n')}`
      : '';

    const userPrompt = `Question: "${params.question}"

Write an ideal answer (2-3 paragraphs, 150-250 words) that:
- Directly addresses the question
- Demonstrates strong understanding
- Includes specific examples or scenarios
- Shows practical experience
- Is appropriate for ${params.difficulty} level${expectedPointsSection}

Provide ONLY the answer text, no preamble.`;

    try {
      const response = await this.callOpenAI(
        `${systemPrompt}\n\n${userPrompt}`,
        0.7,
        600
      );

      // If response is a JSON object, extract the answer field
      if (typeof response === 'object' && response.answer) {
        return response.answer;
      }

      // Otherwise return as string
      return typeof response === 'string' ? response : JSON.stringify(response);
    } catch (error) {
      console.error('[OpenAIService] Failed to generate model answer:', error);
      return 'Model answer generation unavailable.';
    }
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
  async callOpenAI(prompt: string, temperature: number, maxTokens: number): Promise<any> {
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

import OpenAI from 'openai';

// ============================================================================
// Types & Interfaces
// ============================================================================

// Generic topic - can be ANY field, domain, or subject
export type InterviewTopic = string;

export type DifficultyLevel = 'beginner' | 'intermediate' | 'advanced' | 'expert';

export interface QuestionRequest {
  topic: InterviewTopic; // Can be anything: "Banking", "Sales", "Node.js", "Digital Marketing", etc.
  difficulty: DifficultyLevel;
  experienceYears: number;
  previousQuestions?: string[];
  jobDescription?: string;
}

export interface QuestionResponse {
  question: string;
  expectedPoints: string[];
  followUpTopics: string[];
}

export interface FollowUpQuestionRequest {
  topic: InterviewTopic;
  difficulty: DifficultyLevel;
  originalQuestion: string;
  answer: string;
  experienceYears: number;
}

export interface FollowUpQuestionResponse {
  question: string;
  reason: string;
}

export interface EvaluationRequest {
  topic: InterviewTopic;
  difficulty: DifficultyLevel;
  question: string;
  answer: string;
  experienceYears: number;
}

export interface EvaluationResponse {
  technicalScore: number;
  communicationScore: number;
  leadershipScore: number;
  problemSolvingScore: number;
  confidenceScore: number;
  overallScore: number;
  strengths: string[];
  weaknesses: string[];
  suggestions: string[];
  missingPoints: string[];
}

export interface FinalReportRequest {
  topic: InterviewTopic;
  difficulty: DifficultyLevel;
  experienceYears: number;
  evaluations: Array<{
    question: string;
    answer: string;
    evaluation: EvaluationResponse;
  }>;
}

export interface FinalReportResponse {
  overallScore: number;
  summary: string;
  recommendations: string[];
  strengthsOverview: string[];
  weaknessesOverview: string[];
  nextSteps: string[];
}

// ============================================================================
// OpenAI Service Configuration
// ============================================================================

interface OpenAIConfig {
  apiKey: string;
  model: string;
  maxRetries: number;
  timeout: number;
  temperature: number;
}

interface RetryConfig {
  maxAttempts: number;
  initialDelay: number;
  maxDelay: number;
  backoffMultiplier: number;
}

// ============================================================================
// OpenAI Service Class
// ============================================================================

export class OpenAIService {
  private client: OpenAI;
  private config: OpenAIConfig;
  private retryConfig: RetryConfig;

  constructor() {
    const apiKey = process.env.OPENAI_API_KEY || process.env.VITE_OPENAI_API_KEY;
    
    if (!apiKey) {
      throw new Error('OpenAI API key not found in environment variables');
    }

    this.config = {
      apiKey,
      model: process.env.OPENAI_MODEL || 'gpt-3.5-turbo-1106',
      maxRetries: 3,
      timeout: 60000,
      temperature: 0.7,
    };

    console.log(`🔧 [OpenAIService] Initializing with model: ${this.config.model}`);

    this.retryConfig = {
      maxAttempts: 3,
      initialDelay: 1000,
      maxDelay: 10000,
      backoffMultiplier: 2,
    };

    this.client = new OpenAI({
      apiKey: this.config.apiKey,
      maxRetries: this.config.maxRetries,
      timeout: this.config.timeout,
      dangerouslyAllowBrowser: true, // Enable for frontend usage
    });
  }

  /**
   * Check if current model supports JSON mode (response_format)
   */
  private supportsJsonMode(): boolean {
    const model = this.config.model.toLowerCase();
    // Models that support JSON mode
    return (
      model.includes('gpt-4o') ||
      model.includes('gpt-4-turbo') ||
      model.includes('gpt-4-1106') ||
      model.includes('gpt-3.5-turbo-1106') ||
      model.includes('gpt-3.5-turbo-0125')
    );
  }

  // ==========================================================================
  // Public Methods
  // ==========================================================================

  /**
   * Generate an interview question based on topic and difficulty
   */
  async generateQuestion(request: QuestionRequest): Promise<QuestionResponse> {
    console.log('🟡 [OpenAIService] generateQuestion called with request:', request);
    const systemPrompt = this.getQuestionSystemPrompt(request.topic, request.difficulty);
    const userPrompt = this.getQuestionUserPrompt(request);

    console.log('🟡 [OpenAIService] Calling OpenAI API...');
    return this.executeWithRetry(async () => {
      const completionOptions: any = {
        model: this.config.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.8,
        max_tokens: 800,
      };

      // Only add response_format if model supports it
      if (this.supportsJsonMode()) {
        completionOptions.response_format = { type: 'json_object' };
      }

      const response = await this.client.chat.completions.create(completionOptions);

      console.log('🟡 [OpenAIService] OpenAI response received');
      const content = response.choices[0]?.message?.content;
      if (!content) {
        throw new Error('No response from OpenAI');
      }

      const parsed = JSON.parse(content);
      return this.validateQuestionResponse(parsed);
    });
  }

  /**
   * Generate a follow-up question based on candidate's answer
   */
  async generateFollowUpQuestion(
    request: FollowUpQuestionRequest
  ): Promise<FollowUpQuestionResponse> {
    const systemPrompt = this.getFollowUpSystemPrompt(request.topic, request.difficulty);
    const userPrompt = this.getFollowUpUserPrompt(request);

    return this.executeWithRetry(async () => {
      const completionOptions: any = {
        model: this.config.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.8,
        max_tokens: 500,
      };

      if (this.supportsJsonMode()) {
        completionOptions.response_format = { type: 'json_object' };
      }

      const response = await this.client.chat.completions.create(completionOptions);

      const content = response.choices[0]?.message?.content;
      if (!content) {
        throw new Error('No response from OpenAI');
      }

      const parsed = JSON.parse(content);
      return this.validateFollowUpResponse(parsed);
    });
  }

  /**
   * Evaluate a candidate's answer
   */
  async evaluateAnswer(request: EvaluationRequest): Promise<EvaluationResponse> {
    const systemPrompt = this.getEvaluationSystemPrompt(request.topic, request.difficulty);
    const userPrompt = this.getEvaluationUserPrompt(request);

    return this.executeWithRetry(async () => {
      const completionOptions: any = {
        model: this.config.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.3,
        max_tokens: 1500,
      };

      if (this.supportsJsonMode()) {
        completionOptions.response_format = { type: 'json_object' };
      }

      const response = await this.client.chat.completions.create(completionOptions);

      const content = response.choices[0]?.message?.content;
      if (!content) {
        throw new Error('No response from OpenAI');
      }

      const parsed = JSON.parse(content);
      return this.validateEvaluationResponse(parsed);
    });
  }

  /**
   * Generate final interview report
   */
  async generateFinalReport(request: FinalReportRequest): Promise<FinalReportResponse> {
    const systemPrompt = this.getFinalReportSystemPrompt(request.topic);
    const userPrompt = this.getFinalReportUserPrompt(request);

    return this.executeWithRetry(async () => {
      const completionOptions: any = {
        model: this.config.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.4,
        max_tokens: 2000,
      };

      if (this.supportsJsonMode()) {
        completionOptions.response_format = { type: 'json_object' };
      }

      const response = await this.client.chat.completions.create(completionOptions);

      const content = response.choices[0]?.message?.content;
      if (!content) {
        throw new Error('No response from OpenAI');
      }

      const parsed = JSON.parse(content);
      return this.validateFinalReportResponse(parsed);
    });
  }

  // ==========================================================================
  // System Prompts
  // ==========================================================================

  private getQuestionSystemPrompt(topic: InterviewTopic, difficulty: DifficultyLevel): string {
    return `You are an EXPERT PROFESSIONAL INTERVIEWER conducting interviews for: ${topic}

You are interviewing candidates at ${difficulty} level (they could be students, freshers, professionals, or experts).

Your role:
- Generate ONE realistic, practical interview question for the ${topic} field/domain
- Tailor the question to ${difficulty} difficulty level
- Focus on real-world scenarios and practical problem-solving relevant to ${topic}
- Ensure questions are clear, specific, and professionally appropriate
- Questions should be suitable for candidates at ${difficulty} level (from students to professionals)
- Test actual competencies, skills, and knowledge in ${topic}
- Avoid overly theoretical or trivial questions

Response format (JSON only):
{
  "question": "The interview question",
  "expectedPoints": ["point1", "point2", "point3"],
  "followUpTopics": ["topic1", "topic2"]
}`;
  }

  private getFollowUpSystemPrompt(topic: InterviewTopic, difficulty: DifficultyLevel): string {
    return `You are an EXPERT PROFESSIONAL INTERVIEWER for ${topic} conducting a ${difficulty} level interview.

The candidate (student/professional/expert) is being assessed at ${difficulty} difficulty level.

Your role:
- Analyze the candidate's answer in the context of ${topic}
- Generate ONE intelligent follow-up question that:
  * Dives deeper into their response
  * Tests understanding of specifics related to ${topic}
  * Explores edge cases, trade-offs, or real-world applications
  * Challenges assumptions
- Keep questions professional and focused

Response format (JSON only):
{
  "question": "The follow-up question",
  "reason": "Why this follow-up is relevant"
}`;
  }

  private getEvaluationSystemPrompt(topic: InterviewTopic, difficulty: DifficultyLevel): string {
    return `You are an EXPERT PROFESSIONAL EVALUATOR for ${topic} interviews.

You are assessing a candidate (could be student/fresher/professional/expert) at ${difficulty} difficulty level.

Evaluation criteria (rate 0-10):
1. Technical/Domain Score: Accuracy, depth, and correctness of knowledge in ${topic}
2. Communication Score: Clarity, structure, ability to explain concepts effectively
3. Leadership Score: Decision-making, initiative, strategic thinking (when applicable)
4. Problem Solving Score: Analytical thinking, practical approach, creativity
5. Confidence Score: Professional presentation, conviction, maturity

Overall Score: Weighted average of all scores

Be objective, fair, and constructive. Consider:
- Answer completeness and relevance to ${topic}
- Real-world applicability and practical knowledge
- Depth of understanding appropriate for ${difficulty} level
- Communication effectiveness and clarity
- Professional maturity and presentation

Response format (JSON only):
{
  "technicalScore": 0-10,
  "communicationScore": 0-10,
  "leadershipScore": 0-10,
  "problemSolvingScore": 0-10,
  "confidenceScore": 0-10,
  "overallScore": 0-10,
  "strengths": ["strength1", "strength2"],
  "weaknesses": ["weakness1", "weakness2"],
  "suggestions": ["suggestion1", "suggestion2"],
  "missingPoints": ["missing1", "missing2"]
}`;
  }

  private getFinalReportSystemPrompt(topic: InterviewTopic): string {
    return `You are an EXPERT CAREER COACH and PROFESSIONAL INTERVIEW ASSESSOR for the ${topic} field.

You are creating a comprehensive final report for a candidate (student/fresher/professional/expert).

Your role:
- Analyze overall interview performance in ${topic}
- Identify patterns and themes across all answers
- Provide actionable, specific feedback relevant to ${topic}
- Give clear recommendations for improvement and career growth
- Be encouraging yet honest and professional

Focus on:
- Key strengths demonstrated in ${topic} competencies
- Critical areas for improvement
- Specific next steps for professional development
- Overall readiness assessment for ${topic} roles

Response format (JSON only):
{
  "overallScore": 0-10,
  "summary": "Comprehensive 2-3 paragraph summary",
  "recommendations": ["rec1", "rec2", "rec3"],
  "strengthsOverview": ["strength1", "strength2"],
  "weaknessesOverview": ["weakness1", "weakness2"],
  "nextSteps": ["step1", "step2", "step3"]
}`;
  }

  // ==========================================================================
  // User Prompts
  // ==========================================================================

  private getQuestionUserPrompt(request: QuestionRequest): string {
    const experienceLevel = this.getExperienceLevel(request.experienceYears);
    let prompt = `Generate a ${request.difficulty} level ${request.topic} interview question.\n\n`;
    prompt += `Candidate profile: ${experienceLevel} (${request.experienceYears} years experience)\n\n`;

    if (request.previousQuestions && request.previousQuestions.length > 0) {
      prompt += `Previously asked questions (avoid duplicates):\n`;
      request.previousQuestions.forEach((q, i) => {
        prompt += `${i + 1}. ${q}\n`;
      });
      prompt += '\n';
    }

    if (request.jobDescription) {
      prompt += `Job context:\n${request.jobDescription}\n\n`;
    }

    prompt += `Generate a NEW, DIFFERENT question that:\n`;
    prompt += `- Tests ${request.topic} competencies at ${request.difficulty} level\n`;
    prompt += `- Matches the candidate's ${experienceLevel} level (${request.experienceYears} years)\n`;
    prompt += `- Focuses on practical, real-world scenarios\n`;
    prompt += `- Is clear, specific, and professionally appropriate\n`;
    prompt += `- Assesses actual skills and knowledge, not memorization\n\n`;
    prompt += `Return ONLY valid JSON with: question, expectedPoints, followUpTopics`;

    return prompt;
  }

  private getFollowUpUserPrompt(request: FollowUpQuestionRequest): string {
    return `Original Question: "${request.originalQuestion}"

Candidate's Answer: "${request.answer}"

Experience: ${request.experienceYears} years
Topic: ${request.topic}
Difficulty: ${request.difficulty}

Generate ONE intelligent follow-up question that:
- Dives deeper into their specific answer
- Tests understanding of details or edge cases
- Explores trade-offs or alternative approaches
- Challenges or validates their reasoning

Return ONLY valid JSON with: question, reason`;
  }

  private getEvaluationUserPrompt(request: EvaluationRequest): string {
    return `Topic: ${request.topic}
Difficulty: ${request.difficulty}
Experience: ${request.experienceYears} years

Question: "${request.question}"

Candidate's Answer: "${request.answer}"

Evaluate this answer objectively and provide:
- Scores for all 5 dimensions (0-10)
- Overall score (weighted average)
- 2-4 specific strengths
- 2-4 areas for improvement
- 2-4 actionable suggestions
- Key points missing from the answer

Return ONLY valid JSON matching the evaluation schema.`;
  }

  private getFinalReportUserPrompt(request: FinalReportRequest): string {
    let prompt = `Interview Summary
Topic: ${request.topic}
Difficulty: ${request.difficulty}
Experience: ${request.experienceYears} years
Total Questions: ${request.evaluations.length}

Question-by-Question Performance:\n\n`;

    request.evaluations.forEach((item, index) => {
      prompt += `Question ${index + 1}: "${item.question}"\n`;
      prompt += `Answer: "${item.answer.substring(0, 200)}..."\n`;
      prompt += `Scores: Technical ${item.evaluation.technicalScore}, Communication ${item.evaluation.communicationScore}, Problem Solving ${item.evaluation.problemSolvingScore}\n`;
      prompt += `Overall: ${item.evaluation.overallScore}/10\n\n`;
    });

    const avgScore = request.evaluations.reduce((sum, e) => sum + e.evaluation.overallScore, 0) / request.evaluations.length;
    prompt += `\nAverage Score: ${avgScore.toFixed(2)}/10\n\n`;

    prompt += `Generate a comprehensive final report with:\n`;
    prompt += `- Overall assessment and score\n`;
    prompt += `- Detailed 2-3 paragraph summary of performance\n`;
    prompt += `- 3-5 key recommendations for improvement\n`;
    prompt += `- 3-5 major strengths demonstrated\n`;
    prompt += `- 3-5 critical weaknesses to address\n`;
    prompt += `- 3-5 specific next steps for growth\n\n`;
    prompt += `Return ONLY valid JSON matching the final report schema.`;

    return prompt;
  }

  // ==========================================================================
  // Helper Methods
  // ==========================================================================

  /**
   * Get experience level label based on years
   */
  private getExperienceLevel(years: number): string {
    if (years === 0) return 'Entry-level / Fresher';
    if (years <= 2) return 'Junior / Entry-level';
    if (years <= 4) return 'Mid-level';
    if (years <= 7) return 'Senior';
    if (years <= 10) return 'Lead / Principal';
    return 'Architect / Executive';
  }

  // ==========================================================================
  // Validation
  // ==========================================================================

  private validateQuestionResponse(data: any): QuestionResponse {
    if (!data.question || typeof data.question !== 'string') {
      throw new Error('Invalid question format');
    }
    if (!Array.isArray(data.expectedPoints)) {
      throw new Error('Invalid expectedPoints format');
    }
    if (!Array.isArray(data.followUpTopics)) {
      throw new Error('Invalid followUpTopics format');
    }
    return {
      question: data.question,
      expectedPoints: data.expectedPoints,
      followUpTopics: data.followUpTopics,
    };
  }

  private validateFollowUpResponse(data: any): FollowUpQuestionResponse {
    if (!data.question || typeof data.question !== 'string') {
      throw new Error('Invalid follow-up question format');
    }
    if (!data.reason || typeof data.reason !== 'string') {
      throw new Error('Invalid reason format');
    }
    return {
      question: data.question,
      reason: data.reason,
    };
  }

  private validateEvaluationResponse(data: any): EvaluationResponse {
    const scores = [
      'technicalScore',
      'communicationScore',
      'leadershipScore',
      'problemSolvingScore',
      'confidenceScore',
      'overallScore',
    ];

    for (const score of scores) {
      if (typeof data[score] !== 'number' || data[score] < 0 || data[score] > 10) {
        throw new Error(`Invalid ${score}: must be a number between 0-10`);
      }
    }

    if (!Array.isArray(data.strengths) || !Array.isArray(data.weaknesses) || 
        !Array.isArray(data.suggestions) || !Array.isArray(data.missingPoints)) {
      throw new Error('Invalid array fields in evaluation');
    }

    return {
      technicalScore: data.technicalScore,
      communicationScore: data.communicationScore,
      leadershipScore: data.leadershipScore,
      problemSolvingScore: data.problemSolvingScore,
      confidenceScore: data.confidenceScore,
      overallScore: data.overallScore,
      strengths: data.strengths,
      weaknesses: data.weaknesses,
      suggestions: data.suggestions,
      missingPoints: data.missingPoints,
    };
  }

  private validateFinalReportResponse(data: any): FinalReportResponse {
    if (typeof data.overallScore !== 'number' || data.overallScore < 0 || data.overallScore > 10) {
      throw new Error('Invalid overall score');
    }
    if (!data.summary || typeof data.summary !== 'string') {
      throw new Error('Invalid summary format');
    }
    if (!Array.isArray(data.recommendations) || !Array.isArray(data.strengthsOverview) ||
        !Array.isArray(data.weaknessesOverview) || !Array.isArray(data.nextSteps)) {
      throw new Error('Invalid array fields in final report');
    }

    return {
      overallScore: data.overallScore,
      summary: data.summary,
      recommendations: data.recommendations,
      strengthsOverview: data.strengthsOverview,
      weaknessesOverview: data.weaknessesOverview,
      nextSteps: data.nextSteps,
    };
  }

  // ==========================================================================
  // Retry Logic with Exponential Backoff
  // ==========================================================================

  private async executeWithRetry<T>(
    operation: () => Promise<T>,
    attempt: number = 1
  ): Promise<T> {
    try {
      return await operation();
    } catch (error: any) {
      if (attempt >= this.retryConfig.maxAttempts) {
        throw this.handleError(error);
      }

      // Retry on specific errors
      if (this.shouldRetry(error)) {
        const delay = Math.min(
          this.retryConfig.initialDelay * Math.pow(this.retryConfig.backoffMultiplier, attempt - 1),
          this.retryConfig.maxDelay
        );

        console.warn(`OpenAI request failed (attempt ${attempt}/${this.retryConfig.maxAttempts}), retrying in ${delay}ms...`);
        
        await this.sleep(delay);
        return this.executeWithRetry(operation, attempt + 1);
      }

      throw this.handleError(error);
    }
  }

  private shouldRetry(error: any): boolean {
    // Retry on rate limit, timeout, or server errors
    if (error?.status === 429) return true; // Rate limit
    if (error?.status === 500) return true; // Server error
    if (error?.status === 502) return true; // Bad gateway
    if (error?.status === 503) return true; // Service unavailable
    if (error?.code === 'ETIMEDOUT') return true; // Timeout
    if (error?.code === 'ECONNRESET') return true; // Connection reset
    return false;
  }

  private handleError(error: any): Error {
    if (error?.status === 401) {
      return new Error('OpenAI API authentication failed. Check your API key.');
    }
    if (error?.status === 429) {
      return new Error('OpenAI API rate limit exceeded. Please try again later.');
    }
    if (error?.status === 500 || error?.status === 502 || error?.status === 503) {
      return new Error('OpenAI service is temporarily unavailable. Please try again.');
    }
    if (error?.message) {
      return new Error(`OpenAI API error: ${error.message}`);
    }
    return new Error('Unknown OpenAI API error occurred');
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // ==========================================================================
  // Utility Methods
  // ==========================================================================

  /**
   * Test connection to OpenAI API
   */
  async testConnection(): Promise<boolean> {
    try {
      const response = await this.client.chat.completions.create({
        model: this.config.model,
        messages: [{ role: 'user', content: 'Hello' }],
        max_tokens: 5,
      });
      return !!response.choices[0]?.message?.content;
    } catch (error) {
      console.error('OpenAI connection test failed:', error);
      return false;
    }
  }

  /**
   * Get current configuration
   */
  getConfig(): Readonly<OpenAIConfig> {
    return { ...this.config };
  }

  /**
   * Update model
   */
  setModel(model: string): void {
    this.config.model = model;
  }

  /**
   * Update temperature
   */
  setTemperature(temperature: number): void {
    if (temperature < 0 || temperature > 2) {
      throw new Error('Temperature must be between 0 and 2');
    }
    this.config.temperature = temperature;
  }
}

// ============================================================================
// Singleton Export
// ============================================================================

let openAIServiceInstance: OpenAIService | null = null;

export const getOpenAIService = (): OpenAIService => {
  if (!openAIServiceInstance) {
    openAIServiceInstance = new OpenAIService();
  }
  return openAIServiceInstance;
};

export default OpenAIService;

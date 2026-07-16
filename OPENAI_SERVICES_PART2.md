# OpenAI Services - Part 2: Implementation

## Evaluation Service

```typescript
// src/services/openai/evaluation.service.ts

import { injectable, inject } from 'tsyringe';
import { OpenAIClient } from './openai-client';
import { PromptTemplateService } from './prompt-template.service';
import {
  EvaluateAnswerRequest,
  AnswerEvaluation,
  OpenAIResponse,
} from '../../interfaces/openai.interface';

@injectable()
export class EvaluationService {
  constructor(
    @inject(OpenAIClient) private openAIClient: OpenAIClient,
    @inject(PromptTemplateService) private promptTemplate: PromptTemplateService
  ) {}

  /**
   * Evaluate candidate's answer
   */
  async evaluateAnswer(
    request: EvaluateAnswerRequest
  ): Promise<OpenAIResponse<AnswerEvaluation>> {
    // Get prompt template
    const systemPrompt = this.promptTemplate.getEvaluationPrompt(
      request.topic,
      request.context?.interviewType || 'technical'
    );

    // Build user message
    const userMessage = this.buildEvaluationUserMessage(request);

    // Call OpenAI with GPT-4 for better evaluation quality
    return this.openAIClient.callWithRetry<AnswerEvaluation>(
      {
        model: 'gpt-4', // Use GPT-4 for accurate evaluation
        temperature: 0.3, // Lower temperature for consistent scoring
        max_tokens: 1500,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage },
        ],
        response_format: { type: 'json_object' },
      },
      {
        maxRetries: 3,
        retryDelay: 2000,
      }
    );
  }

  /**
   * Build user message for evaluation
   */
  private buildEvaluationUserMessage(request: EvaluateAnswerRequest): string {
    let message = `Evaluate the following interview answer:\n\n`;
    message += `Question: ${request.question}\n\n`;
    message += `Candidate's Answer: ${request.answer}\n\n`;
    message += `Topic: ${request.topic}\n`;
    message += `Difficulty: ${request.difficulty}\n`;

    if (request.expectedKeywords && request.expectedKeywords.length > 0) {
      message += `\nExpected Keywords: ${request.expectedKeywords.join(', ')}\n`;
    }

    if (request.context) {
      message += `\nContext:\n`;
      message += `- Candidate Experience: ${request.context.experienceYears} years\n`;
      message += `- Interview Type: ${request.context.interviewType}\n`;
    }

    message += `\nProvide evaluation in the following JSON format:\n`;
    message += `{\n`;
    message += `  "scores": {\n`;
    message += `    "technical": 8,\n`;
    message += `    "communication": 7,\n`;
    message += `    "leadership": 6,\n`;
    message += `    "problemSolving": 8,\n`;
    message += `    "confidence": 7,\n`;
    message += `    "overall": 7.2\n`;
    message += `  },\n`;
    message += `  "feedback": {\n`;
    message += `    "strengths": ["Point 1", "Point 2"],\n`;
    message += `    "weaknesses": ["Point 1", "Point 2"],\n`;
    message += `    "suggestions": ["Suggestion 1", "Suggestion 2"],\n`;
    message += `    "detailedAnalysis": "Overall assessment...",\n`;
    message += `    "keywordCoverage": [\n`;
    message += `      {"keyword": "keyword1", "covered": true}\n`;
    message += `    ]\n`;
    message += `  },\n`;
    message += `  "grade": "Excellent|Good|Average|Below Average|Poor"\n`;
    message += `}`;

    return message;
  }

  /**
   * Batch evaluate multiple answers
   * Cost optimization: Evaluate in batches when possible
   */
  async batchEvaluate(
    requests: EvaluateAnswerRequest[]
  ): Promise<OpenAIResponse<AnswerEvaluation>[]> {
    // Process in parallel with rate limiting
    const batchSize = 5; // Process 5 at a time
    const results: OpenAIResponse<AnswerEvaluation>[] = [];

    for (let i = 0; i < requests.length; i += batchSize) {
      const batch = requests.slice(i, i + batchSize);
      const batchResults = await Promise.all(
        batch.map((request) => this.evaluateAnswer(request))
      );
      results.push(...batchResults);

      // Small delay between batches to avoid rate limits
      if (i + batchSize < requests.length) {
        await this.sleep(1000);
      }
    }

    return results;
  }

  /**
   * Sleep utility
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
```

---

## Report Service

```typescript
// src/services/openai/report.service.ts

import { injectable, inject } from 'tsyringe';
import { OpenAIClient } from './openai-client';
import { PromptTemplateService } from './prompt-template.service';
import {
  GenerateReportRequest,
  InterviewReport,
  OpenAIResponse,
} from '../../interfaces/openai.interface';

@injectable()
export class ReportService {
  constructor(
    @inject(OpenAIClient) private openAIClient: OpenAIClient,
    @inject(PromptTemplateService) private promptTemplate: PromptTemplateService
  ) {}

  /**
   * Generate final interview report
   */
  async generateFinalReport(
    request: GenerateReportRequest
  ): Promise<OpenAIResponse<InterviewReport>> {
    // Get prompt template
    const systemPrompt = this.promptTemplate.getReportPrompt(request.topic);

    // Build user message
    const userMessage = this.buildReportUserMessage(request);

    // Call OpenAI with GPT-4 for comprehensive report
    return this.openAIClient.callWithRetry<InterviewReport>(
      {
        model: 'gpt-4', // Use GPT-4 for detailed reports
        temperature: 0.5,
        max_tokens: 2000,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage },
        ],
        response_format: { type: 'json_object' },
      },
      {
        maxRetries: 3,
        retryDelay: 2000,
      }
    );
  }

  /**
   * Build user message for report generation
   */
  private buildReportUserMessage(request: GenerateReportRequest): string {
    let message = `Generate a comprehensive interview report:\n\n`;
    message += `Topic: ${request.topic}\n`;
    message += `Difficulty: ${request.difficulty}\n`;
    message += `Candidate Experience: ${request.experienceYears} years\n`;
    message += `Interview Duration: ${Math.floor(request.interviewDuration / 60)} minutes\n\n`;

    // Calculate summary statistics
    const totalQuestions = request.evaluations.length;
    const avgScore =
      request.evaluations.reduce((sum, e) => sum + e.evaluation.scores.overall, 0) /
      totalQuestions;
    const avgResponseTime = request.interviewDuration / totalQuestions;

    message += `Summary Statistics:\n`;
    message += `- Total Questions: ${totalQuestions}\n`;
    message += `- Average Score: ${avgScore.toFixed(2)}/10\n`;
    message += `- Average Response Time: ${avgResponseTime.toFixed(0)}s\n\n`;

    message += `Question-Answer Evaluations:\n`;
    request.evaluations.forEach((eval, index) => {
      message += `\n${index + 1}. Question: ${eval.question}\n`;
      message += `   Answer: ${eval.answer.substring(0, 200)}${
        eval.answer.length > 200 ? '...' : ''
      }\n`;
      message += `   Scores: Technical=${eval.evaluation.scores.technical}, `;
      message += `Communication=${eval.evaluation.scores.communication}, `;
      message += `Overall=${eval.evaluation.scores.overall}\n`;
      message += `   Strengths: ${eval.evaluation.feedback.strengths.join(', ')}\n`;
      message += `   Weaknesses: ${eval.evaluation.feedback.weaknesses.join(', ')}\n`;
    });

    message += `\n\nGenerate report in the following JSON format:\n`;
    message += `{\n`;
    message += `  "summary": {\n`;
    message += `    "overallScore": 7.5,\n`;
    message += `    "totalQuestions": ${totalQuestions},\n`;
    message += `    "averageResponseTime": ${avgResponseTime.toFixed(0)},\n`;
    message += `    "interviewDuration": ${request.interviewDuration}\n`;
    message += `  },\n`;
    message += `  "scoreBreakdown": {\n`;
    message += `    "technical": 8.0,\n`;
    message += `    "communication": 7.5,\n`;
    message += `    "leadership": 6.8,\n`;
    message += `    "problemSolving": 7.8,\n`;
    message += `    "confidence": 7.2\n`;
    message += `  },\n`;
    message += `  "insights": {\n`;
    message += `    "topStrengths": ["Strength 1", "Strength 2", "Strength 3"],\n`;
    message += `    "topWeaknesses": ["Weakness 1", "Weakness 2"],\n`;
    message += `    "improvementAreas": ["Area 1", "Area 2", "Area 3"],\n`;
    message += `    "overallAssessment": "Detailed assessment..."\n`;
    message += `  },\n`;
    message += `  "recommendations": {\n`;
    message += `    "studyTopics": ["Topic 1", "Topic 2"],\n`;
    message += `    "practiceAreas": ["Area 1", "Area 2"],\n`;
    message += `    "resources": [\n`;
    message += `      {"title": "Resource 1", "type": "article", "url": "https://..."}\n`;
    message += `    ]\n`;
    message += `  }\n`;
    message += `}`;

    return message;
  }

  /**
   * Generate quick summary (lighter report)
   * Cost optimization: Use GPT-3.5 for quick summaries
   */
  async generateQuickSummary(
    request: GenerateReportRequest
  ): Promise<OpenAIResponse<{ summary: string; keyInsights: string[] }>> {
    const userMessage = `Create a brief summary of this interview:\n\n`;
    const evalSummary = request.evaluations
      .map(
        (e, i) =>
          `Q${i + 1}: Score ${e.evaluation.scores.overall}/10 - ${e.evaluation.grade}`
      )
      .join('\n');

    return this.openAIClient.callWithRetry(
      {
        model: 'gpt-3.5-turbo',
        temperature: 0.7,
        max_tokens: 300,
        messages: [
          {
            role: 'system',
            content: 'You are an interview report summarizer. Provide concise summaries.',
          },
          { role: 'user', content: userMessage + evalSummary },
        ],
        response_format: { type: 'json_object' },
      },
      {
        maxRetries: 2,
        retryDelay: 1000,
      }
    );
  }
}
```

---

## Prompt Template Service

```typescript
// src/services/openai/prompt-template.service.ts

import { injectable } from 'tsyringe';
import { InterviewTopic, InterviewType } from '../../interfaces/openai.interface';

@injectable()
export class PromptTemplateService {
  /**
   * Get question generation prompt
   */
  getQuestionPrompt(topic: InterviewTopic, interviewType: InterviewType): string {
    const basePrompt = `You are an expert technical interviewer specializing in ${topic}.
Your role is to generate high-quality, relevant interview questions that assess candidates' knowledge and skills.

Generate questions that are:
- Clear and unambiguous
- Appropriate for the specified difficulty level
- Relevant to real-world scenarios
- Fair and unbiased
- Focused on practical knowledge and problem-solving

Always return valid JSON responses only.`;

    const topicSpecificPrompts: Record<InterviewTopic, string> = {
      NodeJS: this.getNodeJSPrompt(interviewType),
      React: this.getReactPrompt(interviewType),
      Angular: this.getAngularPrompt(interviewType),
      MongoDB: this.getMongoDBPrompt(interviewType),
      TypeScript: this.getTypeScriptPrompt(interviewType),
      SystemDesign: this.getSystemDesignPrompt(),
      TeamLead: this.getTeamLeadPrompt(),
      EngineeringManager: this.getEngineeringManagerPrompt(),
    };

    return basePrompt + '\n\n' + topicSpecificPrompts[topic];
  }

  /**
   * Get follow-up question prompt
   */
  getFollowUpPrompt(): string {
    return `You are an expert interviewer conducting a follow-up discussion.

Based on the candidate's answer, generate a relevant follow-up question that:
- Probes deeper into the topic
- Clarifies ambiguous points
- Tests practical understanding
- Explores edge cases or advanced concepts
- Assesses problem-solving approach

The follow-up should be natural and conversational, building on what the candidate said.

Return valid JSON only.`;
  }

  /**
   * Get evaluation prompt
   */
  getEvaluationPrompt(topic: InterviewTopic, interviewType: InterviewType): string {
    return `You are a senior technical interviewer evaluating candidate responses for ${topic}.

Evaluate the answer based on:

1. **Technical Accuracy** (0-10): Correctness of technical concepts and terminology
2. **Communication** (0-10): Clarity, structure, and articulation
3. **Leadership** (0-10): Demonstrates ownership, decision-making, mentoring (if applicable)
4. **Problem Solving** (0-10): Analytical thinking and approach to challenges
5. **Confidence** (0-10): Demonstrates self-assurance without overconfidence

Scoring Guidelines:
- 9-10: Exceptional - Expert level, comprehensive understanding
- 7-8: Good - Solid understanding with minor gaps
- 5-6: Average - Basic understanding, needs improvement
- 3-4: Below Average - Significant gaps in knowledge
- 0-2: Poor - Fundamental misunderstandings

Provide specific, actionable feedback with:
- 3-5 specific strengths
- 2-4 areas for improvement
- 3-5 concrete suggestions for growth

Be fair, constructive, and encouraging while being honest about gaps.

Return valid JSON only.`;
  }

  /**
   * Get report generation prompt
   */
  getReportPrompt(topic: InterviewTopic): string {
    return `You are a senior technical interviewer preparing a comprehensive interview report for ${topic}.

Analyze the complete interview performance and provide:

1. **Overall Assessment**: Holistic view of candidate's performance
2. **Score Breakdown**: Average scores across all dimensions
3. **Key Insights**: Top 3-5 strengths and areas for improvement
4. **Recommendations**: Specific study topics and practice areas
5. **Resources**: Relevant learning materials (articles, courses, books)

The report should be:
- Comprehensive yet concise
- Evidence-based (referencing specific answers)
- Constructive and encouraging
- Actionable (clear next steps)
- Professional and objective

Consider the candidate's experience level when making recommendations.

Return valid JSON only.`;
  }

  // Topic-specific prompts

  private getNodeJSPrompt(interviewType: InterviewType): string {
    if (interviewType === 'technical') {
      return `For Node.js technical interviews, focus on:
- Core concepts: Event loop, streams, buffers, modules
- Asynchronous programming: Callbacks, Promises, async/await
- Performance: Memory management, clustering, worker threads
- Security: Common vulnerabilities, best practices
- Frameworks: Express, NestJS, Fastify
- Testing: Jest, Mocha, integration testing
- Database integration: MongoDB, PostgreSQL
- Deployment: Docker, Kubernetes, CI/CD
- Real-world scenarios: API design, microservices, error handling`;
    }
    return `Focus on practical Node.js development experience and architectural decisions.`;
  }

  private getReactPrompt(interviewType: InterviewType): string {
    if (interviewType === 'technical') {
      return `For React technical interviews, focus on:
- Core concepts: Components, JSX, props, state
- Hooks: useState, useEffect, useContext, useRef, useMemo, useCallback
- State management: Redux, Context API, Zustand
- Performance: Memoization, lazy loading, code splitting
- Routing: React Router, navigation patterns
- Forms: Controlled components, validation
- Testing: Jest, React Testing Library, E2E testing
- TypeScript integration
- Build tools: Vite, Webpack, CRA
- Best practices: Component design, project structure`;
    }
    return `Focus on React development experience and modern React patterns.`;
  }

  private getAngularPrompt(interviewType: InterviewType): string {
    if (interviewType === 'technical') {
      return `For Angular technical interviews, focus on:
- Core concepts: Components, directives, services, modules
- Dependency injection and providers
- RxJS: Observables, operators, subjects
- Forms: Template-driven and reactive forms
- Routing and guards
- State management: NgRx, Akita
- Change detection strategies
- Performance optimization
- Testing: Jasmine, Karma, TestBed
- CLI and build process
- TypeScript advanced features`;
    }
    return `Focus on Angular development experience and enterprise patterns.`;
  }

  private getMongoDBPrompt(interviewType: InterviewType): string {
    return `For MongoDB interviews, focus on:
- Document model and schema design
- CRUD operations and query patterns
- Aggregation framework
- Indexing strategies and performance
- Replication and sharding
- Transactions and consistency
- Security and access control
- Backup and recovery
- Mongoose ODM (if applicable)
- Performance tuning and optimization`;
  }

  private getTypeScriptPrompt(interviewType: InterviewType): string {
    return `For TypeScript interviews, focus on:
- Type system: Basic types, unions, intersections
- Advanced types: Generics, conditional types, mapped types
- Interfaces vs types
- Type guards and narrowing
- Utility types
- Decorators and metadata
- Module system and namespaces
- Configuration (tsconfig.json)
- Integration with frameworks
- Best practices and patterns`;
  }

  private getSystemDesignPrompt(): string {
    return `For System Design interviews, focus on:
- Requirements gathering (functional and non-functional)
- High-level architecture and component design
- Database design and data modeling
- API design and communication patterns
- Scalability and performance considerations
- Caching strategies
- Load balancing and distributed systems
- Security and authentication
- Monitoring and observability
- Trade-offs and decision rationale
- Real-world constraints and practical solutions`;
  }

  private getTeamLeadPrompt(): string {
    return `For Team Lead interviews, focus on:
- Team management and leadership style
- Project planning and execution
- Code review and quality assurance
- Mentoring and team development
- Conflict resolution
- Stakeholder communication
- Technical decision making
- Agile/Scrum practices
- Performance management
- Balancing technical and managerial responsibilities
- Handling difficult situations
- Building team culture`;
  }

  private getEngineeringManagerPrompt(): string {
    return `For Engineering Manager interviews, focus on:
- Strategic planning and roadmap development
- Team building and hiring
- Performance management and career development
- Cross-functional collaboration
- Resource allocation and prioritization
- Technical leadership and vision
- Organizational scaling
- Stakeholder management
- Budget and cost management
- Process improvement
- Company culture and values
- Handling organizational change`;
  }
}
```

---

## Usage Examples

### Example 1: Generate Interview Question

```typescript
import { container } from 'tsyringe';
import { QuestionGenerationService } from './services/openai/question-generation.service';

async function generateQuestion() {
  const service = container.resolve(QuestionGenerationService);

  const response = await service.generateQuestion({
    topic: 'React',
    difficulty: 'Intermediate',
    experienceYears: 3,
    interviewType: 'technical',
    jobDescription: 'Senior React Developer with Redux experience',
    previousQuestions: [
      'Explain the difference between useState and useReducer',
    ],
  });

  console.log('Generated Question:', response.data.questionText);
  console.log('Category:', response.data.category);
  console.log('Cost:', `$${response.usage.estimatedCost}`);
  console.log('Tokens:', response.usage.totalTokens);
}
```

### Example 2: Evaluate Answer

```typescript
import { container } from 'tsyringe';
import { EvaluationService } from './services/openai/evaluation.service';

async function evaluateAnswer() {
  const service = container.resolve(EvaluationService);

  const response = await service.evaluateAnswer({
    question: 'Explain the React component lifecycle',
    answer: `React components go through several lifecycle phases...`,
    topic: 'React',
    difficulty: 'Intermediate',
    expectedKeywords: ['mounting', 'updating', 'unmounting', 'useEffect'],
    context: {
      experienceYears: 3,
      interviewType: 'technical',
    },
  });

  console.log('Overall Score:', response.data.scores.overall);
  console.log('Grade:', response.data.grade);
  console.log('Strengths:', response.data.feedback.strengths);
  console.log('Suggestions:', response.data.feedback.suggestions);
  console.log('Cost:', `$${response.usage.estimatedCost}`);
}
```

### Example 3: Generate Report

```typescript
import { container } from 'tsyringe';
import { ReportService } from './services/openai/report.service';

async function generateReport() {
  const service = container.resolve(ReportService);

  const response = await service.generateFinalReport({
    topic: 'React',
    difficulty: 'Intermediate',
    experienceYears: 3,
    interviewDuration: 1800, // 30 minutes
    evaluations: [
      {
        question: 'Question 1...',
        answer: 'Answer 1...',
        evaluation: {
          scores: { technical: 8, communication: 7, leadership: 6, problemSolving: 8, confidence: 7, overall: 7.2 },
          feedback: { strengths: ['...'], weaknesses: ['...'], suggestions: ['...'], detailedAnalysis: '...', keywordCoverage: [] },
          grade: 'Good',
        },
      },
      // More evaluations...
    ],
  });

  console.log('Overall Score:', response.data.summary.overallScore);
  console.log('Top Strengths:', response.data.insights.topStrengths);
  console.log('Study Topics:', response.data.recommendations.studyTopics);
  console.log('Cost:', `$${response.usage.estimatedCost}`);
}
```

### Example 4: Complete Interview Flow

```typescript
async function conductInterview() {
  const questionService = container.resolve(QuestionGenerationService);
  const evaluationService = container.resolve(EvaluationService);
  const reportService = container.resolve(ReportService);

  const evaluations = [];
  const totalQuestions = 5;

  for (let i = 0; i < totalQuestions; i++) {
    // 1. Generate question
    const questionResponse = await questionService.generateQuestion({
      topic: 'NodeJS',
      difficulty: 'Advanced',
      experienceYears: 5,
      interviewType: 'technical',
      previousQuestions: evaluations.map(e => e.question),
    });

    const question = questionResponse.data.questionText;
    console.log(`\nQuestion ${i + 1}: ${question}`);

    // 2. Get candidate answer (simulated)
    const candidateAnswer = await getCandidateAnswer(question);

    // 3. Evaluate answer
    const evaluationResponse = await evaluationService.evaluateAnswer({
      question,
      answer: candidateAnswer,
      topic: 'NodeJS',
      difficulty: 'Advanced',
      expectedKeywords: questionResponse.data.expectedKeywords,
      context: {
        experienceYears: 5,
        interviewType: 'technical',
      },
    });

    console.log(`Score: ${evaluationResponse.data.scores.overall}/10`);

    // Store evaluation
    evaluations.push({
      question,
      answer: candidateAnswer,
      evaluation: evaluationResponse.data,
    });

    // Optional: Generate follow-up
    if (i < totalQuestions - 1) {
      const followUpResponse = await questionService.generateFollowUpQuestion({
        originalQuestion: question,
        candidateAnswer,
        topic: 'NodeJS',
        difficulty: 'Advanced',
      });
      console.log(`Follow-up: ${followUpResponse.data.questionText}`);
    }
  }

  // 4. Generate final report
  const reportResponse = await reportService.generateFinalReport({
    topic: 'NodeJS',
    difficulty: 'Advanced',
    experienceYears: 5,
    interviewDuration: 1800,
    evaluations,
  });

  console.log('\n=== Final Report ===');
  console.log('Overall Score:', reportResponse.data.summary.overallScore);
  console.log('Assessment:', reportResponse.data.insights.overallAssessment);
  console.log('Total Cost:', `$${calculateTotalCost()}`);
}
```

---

Continue to Part 3 for Error Handling, Retry Logic, and Cost Optimization...

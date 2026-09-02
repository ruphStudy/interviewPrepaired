import { getOpenAIService } from '../../services/OpenAIService';
import type { OpenAIService, AIUsageContext, AICallMetadataSink, QuestionType } from '../../services/OpenAIService';
import type { AIProvider } from '../AIProvider';
import type {
  AIRequestContext,
  AIResult,
  AIResponseMetadata,
  AIProviderName,
  QuestionRequest,
  QuestionResponse,
  EvaluationRequest,
  EvaluationResponse,
  ModelAnswerRequest,
  ModelAnswerResponse,
  FinalReportRequest,
  FinalReportResponse,
  BlueprintGenerationRequest,
  BlueprintGenerationResponse,
  GenerateTextRequest,
  GenerateTextResponse,
  GenerateStructuredRequest,
  GenerateStructuredResponse,
} from '../types';

function toMetadata(sink: AICallMetadataSink): AIResponseMetadata {
  const raw = sink.current;
  return {
    provider: 'openai',
    model: raw?.model ?? 'unknown',
    inputTokens: raw?.promptTokens ?? 0,
    cachedInputTokens: raw?.cachedTokens ?? 0,
    outputTokens: raw?.completionTokens ?? 0,
    totalTokens: raw?.totalTokens ?? 0,
  };
}

/**
 * OpenAIProvider — the concrete AIProvider behind the existing OpenAIService.
 *
 * Delegates every call to OpenAIService's existing public methods (same
 * prompts, same retry/parsing/cost-tracking behavior, same singleton
 * client). Adapts each call's real response metadata into AIResult<T> via
 * the metadataSink out-param added to OpenAIService — no second OpenAI
 * request, no duplicate usage persistence, no prompt changes.
 */
export class OpenAIProvider implements AIProvider {
  readonly name: AIProviderName = 'openai';

  constructor(private readonly service: OpenAIService = getOpenAIService()) {}

  async generateQuestion(request: QuestionRequest, context?: AIRequestContext): Promise<AIResult<QuestionResponse>> {
    const sink: AICallMetadataSink = {};
    const mergedRequest: QuestionRequest = {
      ...request,
      interviewId: request.interviewId ?? context?.interviewId,
      interviewLanguage: request.interviewLanguage ?? context?.language,
    };
    const data = await this.service.generateQuestion(mergedRequest, sink);
    return { data, metadata: toMetadata(sink) };
  }

  async evaluateAnswer(request: EvaluationRequest, context?: AIRequestContext): Promise<AIResult<EvaluationResponse>> {
    const sink: AICallMetadataSink = {};
    const mergedRequest: EvaluationRequest = {
      ...request,
      interviewId: request.interviewId ?? context?.interviewId,
      questionIndex: request.questionIndex ?? context?.questionIndex,
      interviewLanguage: request.interviewLanguage ?? context?.language,
    };
    const data = await this.service.evaluateAnswer(mergedRequest, sink);
    return { data, metadata: toMetadata(sink) };
  }

  async generateModelAnswer(request: ModelAnswerRequest, context?: AIRequestContext): Promise<AIResult<ModelAnswerResponse>> {
    const sink: AICallMetadataSink = {};
    const data = await this.service.generateModelAnswer(
      {
        question: request.question,
        topic: request.topic,
        difficulty: request.difficulty,
        experienceLevel: request.experienceLevel,
        expectedPoints: request.expectedPoints,
        questionType: request.questionType as QuestionType | undefined,
        interviewId: context?.interviewId,
        questionIndex: context?.questionIndex,
        interviewLanguage: context?.language,
      },
      sink
    );
    return { data, metadata: toMetadata(sink) };
  }

  async generateFinalReport(request: FinalReportRequest, context?: AIRequestContext): Promise<AIResult<FinalReportResponse>> {
    const sink: AICallMetadataSink = {};
    const mergedRequest: FinalReportRequest = {
      ...request,
      interviewId: request.interviewId ?? context?.interviewId,
      interviewLanguage: request.interviewLanguage ?? context?.language,
    };
    const data = await this.service.generateFinalReport(mergedRequest, sink);
    return { data, metadata: toMetadata(sink) };
  }

  async generateInterviewBlueprint(
    request: BlueprintGenerationRequest,
    _context?: AIRequestContext
  ): Promise<AIResult<BlueprintGenerationResponse>> {
    // Deliberately untracked/shared — matches OpenAIService's existing
    // behavior of never attributing blueprint calls to an interviewId.
    const sink: AICallMetadataSink = {};
    const data = await this.service.generateInterviewBlueprint(request, sink);
    return { data, metadata: toMetadata(sink) };
  }

  async generateText(request: GenerateTextRequest, context?: AIRequestContext): Promise<AIResult<GenerateTextResponse>> {
    const sink: AICallMetadataSink = {};
    const usageContext: AIUsageContext | undefined = context
      ? { interviewId: context.interviewId, operation: context.operation ?? 'provider-generate-text', questionIndex: context.questionIndex }
      : undefined;
    // callOpenAI always requests JSON-object format (OpenAIService's single choke
    // point) — non-JSON parses fall back to the stringified parsed content.
    const parsed = await this.service.callOpenAI(request.prompt, request.temperature ?? 0.7, request.maxTokens ?? 500, usageContext, sink);
    const text = typeof parsed === 'string' ? parsed : JSON.stringify(parsed);
    return { data: text, metadata: toMetadata(sink) };
  }

  async generateStructured<T = unknown>(
    request: GenerateStructuredRequest,
    context?: AIRequestContext
  ): Promise<AIResult<GenerateStructuredResponse<T>>> {
    const sink: AICallMetadataSink = {};
    const usageContext: AIUsageContext | undefined = context
      ? { interviewId: context.interviewId, operation: context.operation ?? 'provider-generate-structured', questionIndex: context.questionIndex }
      : undefined;
    const data = (await this.service.callOpenAI(
      request.prompt,
      request.temperature ?? 0.7,
      request.maxTokens ?? 1000,
      usageContext,
      sink
    )) as T;
    return { data, metadata: toMetadata(sink) };
  }
}

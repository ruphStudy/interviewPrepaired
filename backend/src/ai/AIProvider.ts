import type {
  AIRequestContext,
  AIResult,
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
} from './types';

/**
 * Provider-neutral AI contract that future OpenAI/Anthropic/Google
 * implementations conform to.
 *
 * Foundation only: no provider implements this yet, and OpenAIService.ts is
 * NOT migrated to it in this change.
 */
export interface AIProvider {
  readonly name: AIProviderName;

  generateQuestion(request: QuestionRequest, context?: AIRequestContext): Promise<AIResult<QuestionResponse>>;
  evaluateAnswer(request: EvaluationRequest, context?: AIRequestContext): Promise<AIResult<EvaluationResponse>>;
  generateModelAnswer(request: ModelAnswerRequest, context?: AIRequestContext): Promise<AIResult<ModelAnswerResponse>>;
  generateFinalReport(request: FinalReportRequest, context?: AIRequestContext): Promise<AIResult<FinalReportResponse>>;
  generateInterviewBlueprint(
    request: BlueprintGenerationRequest,
    context?: AIRequestContext
  ): Promise<AIResult<BlueprintGenerationResponse>>;

  /**
   * Generic primitives to ease later migration of the auxiliary services'
   * ad-hoc callOpenAI() prompts (STAR analysis, memory extraction, etc.) —
   * not required by the 5 interview-specific methods above.
   */
  generateText(request: GenerateTextRequest, context?: AIRequestContext): Promise<AIResult<GenerateTextResponse>>;
  generateStructured<T = unknown>(
    request: GenerateStructuredRequest,
    context?: AIRequestContext
  ): Promise<AIResult<GenerateStructuredResponse<T>>>;
}

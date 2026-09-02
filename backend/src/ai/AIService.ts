import { resolveProvider } from './providerRegistry';
import { resolveModelRoute } from './modelRouting';
import type { AIOperation } from './modelRouting';
import type { AIProvider } from './AIProvider';
import type {
  AIProviderName,
  AIRequestContext,
  AIResult,
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
 * Provider-neutral AI gateway. Application/domain services should depend on
 * this (via getAIService()) instead of importing OpenAIService or
 * OpenAIProvider directly. Delegates every call to the currently configured
 * AIProvider — no prompts, business logic, or cost/usage logic live here.
 */
export class AIService {
  /** Resolves the operation's model route, then the concrete provider — an explicit providerName always wins over the route's provider. */
  private route(operation: AIOperation, providerName?: AIProviderName): { provider: AIProvider; model: string } {
    const route = resolveModelRoute(operation);
    return { provider: resolveProvider(providerName ?? route.provider), model: route.model };
  }

  generateQuestion(
    request: QuestionRequest,
    context?: AIRequestContext,
    providerName?: AIProviderName
  ): Promise<AIResult<QuestionResponse>> {
    const { provider, model } = this.route('question-generation', providerName);
    return provider.generateQuestion(request, { ...context, model: context?.model ?? model });
  }

  evaluateAnswer(
    request: EvaluationRequest,
    context?: AIRequestContext,
    providerName?: AIProviderName
  ): Promise<AIResult<EvaluationResponse>> {
    const { provider, model } = this.route('answer-evaluation', providerName);
    return provider.evaluateAnswer(request, { ...context, model: context?.model ?? model });
  }

  generateModelAnswer(
    request: ModelAnswerRequest,
    context?: AIRequestContext,
    providerName?: AIProviderName
  ): Promise<AIResult<ModelAnswerResponse>> {
    const { provider, model } = this.route('model-answer-generation', providerName);
    return provider.generateModelAnswer(request, { ...context, model: context?.model ?? model });
  }

  generateFinalReport(
    request: FinalReportRequest,
    context?: AIRequestContext,
    providerName?: AIProviderName
  ): Promise<AIResult<FinalReportResponse>> {
    const { provider, model } = this.route('final-report-generation', providerName);
    return provider.generateFinalReport(request, { ...context, model: context?.model ?? model });
  }

  generateInterviewBlueprint(
    request: BlueprintGenerationRequest,
    context?: AIRequestContext,
    providerName?: AIProviderName
  ): Promise<AIResult<BlueprintGenerationResponse>> {
    const { provider, model } = this.route('blueprint-generation', providerName);
    return provider.generateInterviewBlueprint(request, { ...context, model: context?.model ?? model });
  }

  generateText(
    request: GenerateTextRequest,
    context?: AIRequestContext,
    providerName?: AIProviderName
  ): Promise<AIResult<GenerateTextResponse>> {
    const { provider, model } = this.route('generic-text', providerName);
    return provider.generateText(request, { ...context, model: context?.model ?? model });
  }

  generateStructured<T = unknown>(
    request: GenerateStructuredRequest,
    context?: AIRequestContext,
    providerName?: AIProviderName
  ): Promise<AIResult<GenerateStructuredResponse<T>>> {
    const { provider, model } = this.route('generic-structured', providerName);
    return provider.generateStructured<T>(request, { ...context, model: context?.model ?? model });
  }
}

let instance: AIService | null = null;

/** Returns the singleton AIService instance — created once, reused across requests. */
export const getAIService = (): AIService => {
  if (!instance) {
    instance = new AIService();
  }
  return instance;
};

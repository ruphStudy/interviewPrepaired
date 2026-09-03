/**
 * Provider-neutral AI types.
 *
 * This does NOT replace OpenAIService.ts and nothing here migrates existing
 * calls. It reuses OpenAIService's real, currently-used request/response
 * shapes (re-exported below) instead of duplicating them, and adds the
 * handful of provider-neutral primitives that don't exist yet.
 */

import type {
  QuestionRequest,
  QuestionResponse,
  EvaluationRequest,
  DynamicEvaluationResponse,
  FinalReportRequest,
  FinalReportResponse,
  BlueprintGenerationRequest,
  BlueprintGenerationResponse,
} from '../services/OpenAIService';
import type { SupportedLanguageCode } from '../config/languages';

export type {
  QuestionRequest,
  QuestionResponse,
  EvaluationRequest,
  FinalReportRequest,
  FinalReportResponse,
  BlueprintGenerationRequest,
  BlueprintGenerationResponse,
};
// Renamed on re-export only for naming symmetry with the other *Response types.
export type EvaluationResponse = DynamicEvaluationResponse;

/**
 * generateModelAnswer has no named exported type in OpenAIService.ts (its
 * params are an inline object) — extracted as the minimum shape needed here,
 * not a redesign of that method.
 */
export interface ModelAnswerRequest {
  question: string;
  topic: string;
  difficulty: string;
  experienceLevel: string;
  expectedPoints?: string[];
  questionType?: string;
}

export type ModelAnswerResponse = string;

/** Provider names this contract anticipates. Only 'openai' has a real implementation anywhere in the codebase today. */
export type AIProviderName = 'openai' | 'anthropic' | 'google';

/**
 * Provider-neutral request context. Deliberately does not reuse
 * OpenAIService's own `AIUsageContext` (OpenAI-specific naming/shape,
 * unmigrated) — this is the shape future providers/services should pass.
 */
export interface AIRequestContext {
  userId?: string;
  interviewId?: string;
  organizationId?: string;
  operation?: string;
  questionIndex?: number;
  language?: SupportedLanguageCode;
  /** Optional resolved-route model override — provider-neutral, set by AIService's model routing, not an OpenAI-specific concept. */
  model?: string;
}

/**
 * Metadata a provider call returns alongside its content. Deliberately has
 * no cost fields — AIUsageService remains the single owner of cost
 * calculation, not the provider contract.
 */
export interface AIResponseMetadata {
  provider: AIProviderName;
  model: string;
  inputTokens: number;
  cachedInputTokens?: number;
  outputTokens: number;
  totalTokens: number;
}

/** Wraps a provider call's actual content together with its response metadata. */
export interface AIResult<T> {
  data: T;
  metadata: AIResponseMetadata;
}

/** Generic primitive for later migration of ad-hoc free-text prompts (e.g. auxiliary services' callOpenAI usage) — not used by the 5 interview-specific methods. */
export interface GenerateTextRequest {
  prompt: string;
  temperature?: number;
  maxTokens?: number;
}

export type GenerateTextResponse = string;

/** Generic primitive for later migration of ad-hoc JSON-object prompts. */
export interface GenerateStructuredRequest {
  prompt: string;
  temperature?: number;
  maxTokens?: number;
}

export type GenerateStructuredResponse<T = unknown> = T;

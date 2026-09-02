import { aiConfig } from './config';
import type { AIProviderName } from './types';

/** Operations currently routable — no future/speculative catalog. */
export type AIOperation =
  | 'question-generation'
  | 'answer-evaluation'
  | 'model-answer-generation'
  | 'final-report-generation'
  | 'blueprint-generation'
  | 'generic-text'
  | 'generic-structured';

export interface ModelRoute {
  provider: AIProviderName;
  model: string;
}

/** Only operations with a dedicated env override are listed; the rest fall through to AI_MODEL_DEFAULT / the existing configured default model. */
const OPERATION_ENV_VAR: Partial<Record<AIOperation, string>> = {
  'question-generation': 'AI_MODEL_QUESTION',
  'answer-evaluation': 'AI_MODEL_EVALUATION',
  'final-report-generation': 'AI_MODEL_REPORT',
};

/**
 * Resolves provider+model for an AI operation. Pure — no API calls, no side
 * effects. Fallback order: operation-specific env -> AI_MODEL_DEFAULT ->
 * aiConfig.defaultModel (which itself already preserves OPENAI_MODEL / the
 * 'gpt-4o-mini' fallback). Unknown/unmapped operations safely resolve to
 * that same default chain. Provider selection is always the configured
 * default provider — no per-operation provider routing yet.
 */
export function resolveModelRoute(operation: AIOperation): ModelRoute {
  const envVar = OPERATION_ENV_VAR[operation];
  const operationOverride = envVar ? process.env[envVar] : undefined;
  const model = operationOverride || process.env.AI_MODEL_DEFAULT || aiConfig.defaultModel;

  return {
    provider: aiConfig.defaultProvider,
    model,
  };
}

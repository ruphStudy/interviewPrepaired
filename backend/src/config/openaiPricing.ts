/**
 * OpenAI per-model token pricing (USD per 1,000,000 tokens).
 *
 * These are CONFIGURATION VALUES, not derived automatically — whoever adds a
 * model here must verify the current rate at https://openai.com/api/pricing/
 * and keep this file updated if OpenAI changes it. Nothing in this codebase
 * fetches pricing live.
 *
 * - gpt-3.5-turbo-1106: $1.00 / 1M input, $2.00 / 1M output. No prompt-caching
 *   tier (introduced later for GPT-4o/o-series models).
 * - gpt-4o-mini: $0.15 / 1M input, $0.075 / 1M cached input, $0.60 / 1M
 *   output (OpenAI's published launch pricing). This is OpenAIService's
 *   code-level default model (`OPENAI_MODEL || 'gpt-4o-mini'`), so it must
 *   stay priced here even when .env pins a different model — otherwise any
 *   environment that doesn't set OPENAI_MODEL silently tracks $0 cost.
 *
 * Add a new entry here ONLY for a model this project actually calls — do not
 * pre-populate a broad catalog of unused models. An unconfigured model is
 * handled safely elsewhere (AIUsageService): tokens are still logged, cost
 * stays 0 with pricingStatus='unknown' — never guessed, never thrown.
 */

export interface ModelPricing {
  inputPerMillionUsd: number;
  cachedInputPerMillionUsd?: number;
  outputPerMillionUsd: number;
}

export const OPENAI_MODEL_PRICING: Record<string, ModelPricing> = {
  'gpt-3.5-turbo-1106': {
    inputPerMillionUsd: 1.0,
    outputPerMillionUsd: 2.0,
  },
  'gpt-4o-mini': {
    inputPerMillionUsd: 0.15,
    cachedInputPerMillionUsd: 0.075,
    outputPerMillionUsd: 0.6,
  },
};

/** Returns undefined (never a guessed default) when the model isn't in the table. */
export function getModelPricing(model: string): ModelPricing | undefined {
  return OPENAI_MODEL_PRICING[model];
}

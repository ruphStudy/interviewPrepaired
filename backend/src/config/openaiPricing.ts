/**
 * OpenAI per-model token pricing (USD per 1,000,000 tokens).
 *
 * Source: OpenAI's published API pricing for gpt-3.5-turbo-1106 — $1.00 / 1M
 * input tokens, $2.00 / 1M output tokens. This is the only model this project
 * calls (OPENAI_MODEL in .env). These figures come from training-data
 * knowledge of OpenAI's historical pricing page, not a live pricing API —
 * verify against https://openai.com/api/pricing/ before relying on this for
 * real billing/pricing decisions, and update this file if OpenAI changes it.
 *
 * gpt-3.5-turbo-1106 does not support prompt caching (introduced later for
 * GPT-4o/o-series models), so it has no cachedInputPerMillionUsd tier.
 *
 * Add a new entry here ONLY for a model this project actually calls — do not
 * pre-populate a broad catalog of unused models.
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
};

/** Returns undefined (never a guessed default) when the model isn't in the table. */
export function getModelPricing(model: string): ModelPricing | undefined {
  return OPENAI_MODEL_PRICING[model];
}

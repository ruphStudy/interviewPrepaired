import { env } from '../config/environment';
import type { AIProviderName } from './types';

const KNOWN_PROVIDERS: readonly AIProviderName[] = ['openai', 'anthropic', 'google'];

function resolveDefaultProvider(): AIProviderName {
  const configured = (process.env.AI_PROVIDER || 'openai').toLowerCase();
  return (KNOWN_PROVIDERS as readonly string[]).includes(configured)
    ? (configured as AIProviderName)
    : 'openai';
}

export interface AIConfig {
  defaultProvider: AIProviderName;
  defaultModel: string;
  /** Providers with a real implementation registered. Only 'openai' exists today — this is metadata for a later AI Gateway, not implemented here. */
  enabledProviders: AIProviderName[];
}

export const aiConfig: AIConfig = {
  defaultProvider: resolveDefaultProvider(),
  defaultModel: env.openaiModel,
  enabledProviders: ['openai'],
};

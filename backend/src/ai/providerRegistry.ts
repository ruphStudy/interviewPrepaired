import type { AIProvider } from './AIProvider';
import type { AIProviderName } from './types';
import { OpenAIProvider } from './providers';

// Singleton provider instances — created once, reused across requests.
const providers: Partial<Record<AIProviderName, AIProvider>> = {};

function getOpenAIProvider(): AIProvider {
  if (!providers.openai) {
    providers.openai = new OpenAIProvider();
  }
  return providers.openai;
}

/** Resolves a singleton AIProvider instance by name. Throws for providers with no implementation yet. */
export function resolveProvider(name: AIProviderName): AIProvider {
  switch (name) {
    case 'openai':
      return getOpenAIProvider();
    default:
      throw new Error(`AI provider "${name}" is not implemented`);
  }
}

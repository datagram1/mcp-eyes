/**
 * LLM Provider Factory
 *
 * Creates the appropriate LLM provider based on configuration.
 */

import { LLMConfig, LLMProvider, LLMProviderType } from './types';
import { VLLMProvider } from './providers/vllm';
import { ClaudeProvider } from './providers/claude';
import { OpenAIProvider } from './providers/openai';
import { ClaudeCodeProvider } from './providers/claude-code';
import { ManagedClaudeCodeProvider, ManagedClaudeCodeConfig } from './providers/claude-code-managed';

export * from './types';

/**
 * Create an LLM provider instance based on config
 */
export function createLLMProvider(config: LLMConfig): LLMProvider {
  switch (config.provider) {
    case 'vllm':
      return new VLLMProvider(config);
    case 'claude':
      return new ClaudeProvider(config);
    case 'openai':
      return new OpenAIProvider(config);
    case 'claude-code':
      return new ClaudeCodeProvider(config);
    case 'claude-code-managed':
      if (!config.supervisorConfig) {
        throw new Error('Managed Claude Code requires supervisorConfig');
      }
      return new ManagedClaudeCodeProvider(config as ManagedClaudeCodeConfig);
    default:
      throw new Error(`Unknown LLM provider: ${config.provider}`);
  }
}

/**
 * Get LLM config from environment variables
 */
export function getLLMConfigFromEnv(): LLMConfig | null {
  // Check vLLM/Open WebUI first (your preferred option)
  if (process.env.VLLM_BASE_URL) {
    return {
      provider: 'vllm',
      baseUrl: process.env.VLLM_BASE_URL,
      apiKey: process.env.VLLM_API_KEY,
      model: process.env.VLLM_MODEL,
    };
  }

  // Check Claude
  if (process.env.ANTHROPIC_API_KEY) {
    return {
      provider: 'claude',
      apiKey: process.env.ANTHROPIC_API_KEY,
      model: process.env.CLAUDE_MODEL,
    };
  }

  // Check OpenAI
  if (process.env.OPENAI_API_KEY) {
    return {
      provider: 'openai',
      apiKey: process.env.OPENAI_API_KEY,
      model: process.env.OPENAI_MODEL,
    };
  }

  return null;
}

/**
 * Default LLM settings for different providers
 */
export const LLM_DEFAULTS: Record<LLMProviderType, Partial<LLMConfig>> = {
  vllm: {
    model: 'default',
    temperature: 0.7,
    maxTokens: 4096,
  },
  claude: {
    model: 'claude-sonnet-4-20250514',
    maxTokens: 4096,
  },
  openai: {
    model: 'gpt-4o',
    temperature: 0.7,
    maxTokens: 4096,
  },
  'claude-code': {
    model: 'claude-sonnet-4-20250514',
    maxTokens: 8192,
  },
  'claude-code-managed': {
    model: 'claude-sonnet-4-20250514',
    maxTokens: 8192,
  },
};

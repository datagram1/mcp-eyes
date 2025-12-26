/**
 * LLM Provider Types
 *
 * Abstracts different LLM backends (vLLM, Claude, OpenAI) behind a common interface.
 */

export type LLMProviderType = 'vllm' | 'claude' | 'openai' | 'claude-code' | 'claude-code-managed';

export interface LLMConfig {
  provider: LLMProviderType;
  apiKey?: string;
  baseUrl?: string;  // Required for vLLM, optional for others
  model?: string;
  temperature?: number;
  maxTokens?: number;
  // For managed claude-code mode - supervisor LLM config
  supervisorConfig?: LLMConfig;
}

export interface LLMMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface LLMResponse {
  content: string;
  model: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  finishReason?: string;
}

export interface LLMProvider {
  name: string;
  chat(messages: LLMMessage[]): Promise<LLMResponse>;
  isConfigured(): boolean;
}

// Tool/function calling support for structured output
export interface LLMTool {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, {
      type: string;
      description: string;
      enum?: string[];
    }>;
    required?: string[];
  };
}

export interface LLMToolCall {
  name: string;
  arguments: Record<string, unknown>;
}

export interface LLMResponseWithTools extends LLMResponse {
  toolCalls?: LLMToolCall[];
}

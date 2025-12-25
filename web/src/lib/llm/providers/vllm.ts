/**
 * vLLM Provider
 *
 * Uses OpenAI-compatible API provided by vLLM, Open WebUI, or similar.
 * Compatible with: vLLM, Open WebUI, LocalAI, LM Studio, Ollama, etc.
 */

import { LLMConfig, LLMMessage, LLMResponse, LLMProvider } from '../types';

export class VLLMProvider implements LLMProvider {
  name = 'vLLM';
  private config: LLMConfig;

  constructor(config: LLMConfig) {
    this.config = config;
  }

  isConfigured(): boolean {
    return !!this.config.baseUrl;
  }

  async chat(messages: LLMMessage[]): Promise<LLMResponse> {
    if (!this.config.baseUrl) {
      throw new Error('vLLM base URL not configured');
    }

    const url = `${this.config.baseUrl.replace(/\/$/, '')}/v1/chat/completions`;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    // Some vLLM instances require auth
    if (this.config.apiKey) {
      headers['Authorization'] = `Bearer ${this.config.apiKey}`;
    }

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: this.config.model || 'default',
        messages: messages.map((m) => ({
          role: m.role,
          content: m.content,
        })),
        temperature: this.config.temperature ?? 0.7,
        max_tokens: this.config.maxTokens ?? 4096,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`vLLM API error (${response.status}): ${errorText}`);
    }

    const data = await response.json();

    const choice = data.choices?.[0];
    if (!choice) {
      throw new Error('No response from vLLM');
    }

    return {
      content: choice.message?.content || '',
      model: data.model || this.config.model || 'unknown',
      usage: data.usage
        ? {
            promptTokens: data.usage.prompt_tokens,
            completionTokens: data.usage.completion_tokens,
            totalTokens: data.usage.total_tokens,
          }
        : undefined,
      finishReason: choice.finish_reason,
    };
  }
}

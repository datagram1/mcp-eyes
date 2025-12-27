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
  private cachedModelId: string | null = null;

  constructor(config: LLMConfig) {
    this.config = config;
  }

  isConfigured(): boolean {
    return !!this.config.baseUrl;
  }

  /**
   * Auto-detect the model from the vLLM server if not specified
   */
  private async getModelId(): Promise<string> {
    // Use configured model if it looks valid (not 'default' or empty)
    if (this.config.model && this.config.model !== 'default') {
      return this.config.model;
    }

    // Return cached model if we already fetched it
    if (this.cachedModelId) {
      return this.cachedModelId;
    }

    // Auto-detect from /v1/models
    try {
      const baseUrl = this.config.baseUrl!.replace(/\/$/, '');
      const response = await fetch(`${baseUrl}/v1/models`);
      if (response.ok) {
        const data = await response.json();
        if (data.data && data.data.length > 0) {
          this.cachedModelId = data.data[0].id;
          console.log(`[vLLM] Auto-detected model: ${this.cachedModelId}`);
          return this.cachedModelId!;
        }
      }
    } catch (e) {
      console.warn('[vLLM] Failed to auto-detect model:', e);
    }

    // Fallback to 'default' if auto-detect fails
    return 'default';
  }

  async chat(messages: LLMMessage[]): Promise<LLMResponse> {
    if (!this.config.baseUrl) {
      throw new Error('vLLM base URL not configured');
    }

    const url = `${this.config.baseUrl.replace(/\/$/, '')}/v1/chat/completions`;
    const modelId = await this.getModelId();

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
        model: modelId,
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

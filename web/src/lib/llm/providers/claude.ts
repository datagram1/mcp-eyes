/**
 * Claude Provider
 *
 * Uses Anthropic's Claude API directly.
 */

import { LLMConfig, LLMMessage, LLMResponse, LLMProvider } from '../types';

export class ClaudeProvider implements LLMProvider {
  name = 'Claude';
  private config: LLMConfig;

  constructor(config: LLMConfig) {
    this.config = config;
  }

  isConfigured(): boolean {
    return !!this.config.apiKey;
  }

  async chat(messages: LLMMessage[]): Promise<LLMResponse> {
    if (!this.config.apiKey) {
      throw new Error('Claude API key not configured');
    }

    const baseUrl = this.config.baseUrl || 'https://api.anthropic.com';
    const url = `${baseUrl.replace(/\/$/, '')}/v1/messages`;

    // Extract system message if present
    const systemMessage = messages.find((m) => m.role === 'system');
    const chatMessages = messages.filter((m) => m.role !== 'system');

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.config.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: this.config.model || 'claude-sonnet-4-20250514',
        max_tokens: this.config.maxTokens ?? 4096,
        ...(systemMessage && { system: systemMessage.content }),
        messages: chatMessages.map((m) => ({
          role: m.role,
          content: m.content,
        })),
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Claude API error (${response.status}): ${errorText}`);
    }

    const data = await response.json();

    // Extract text from content blocks
    const content = data.content
      ?.filter((block: { type: string }) => block.type === 'text')
      .map((block: { text: string }) => block.text)
      .join('') || '';

    return {
      content,
      model: data.model || this.config.model || 'unknown',
      usage: data.usage
        ? {
            promptTokens: data.usage.input_tokens,
            completionTokens: data.usage.output_tokens,
            totalTokens: data.usage.input_tokens + data.usage.output_tokens,
          }
        : undefined,
      finishReason: data.stop_reason,
    };
  }
}

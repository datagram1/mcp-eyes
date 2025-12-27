/**
 * Claude Code Provider
 *
 * Uses the Claude Code CLI for autonomous task execution.
 * Unlike regular LLM providers, Claude Code can execute tools autonomously.
 *
 * Note: Claude Code requires login via `claude /login` before first use.
 */

import { spawn } from 'child_process';
import { LLMConfig, LLMMessage, LLMProvider, LLMResponse } from '../types';

export class ClaudeCodeProvider implements LLMProvider {
  name = 'Claude Code';
  private config: LLMConfig;
  private apiKey: string;

  constructor(config: LLMConfig) {
    this.config = config;
    this.apiKey = config.apiKey || process.env.ANTHROPIC_API_KEY || '';
  }

  isConfigured(): boolean {
    // Claude Code can work with either API key or OAuth login
    return true;
  }

  async chat(messages: LLMMessage[]): Promise<LLMResponse> {
    // Extract system prompt and user message
    const systemMessage = messages.find((m) => m.role === 'system');
    const userMessage = messages.find((m) => m.role === 'user');

    if (!userMessage) {
      throw new Error('No user message provided');
    }

    // Build the prompt with system context
    let fullPrompt = userMessage.content;
    if (systemMessage) {
      fullPrompt = `${systemMessage.content}\n\n---\n\n${fullPrompt}`;
    }

    const model = this.config.model || 'claude-sonnet-4-20250514';

    try {
      const result = await this.runClaudeCode(fullPrompt, model);
      return {
        content: result,
        model: model,
        finishReason: 'stop',
      };
    } catch (error) {
      throw new Error(`Claude Code error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private runClaudeCode(prompt: string, model: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const args = [
        '--print',           // Print mode - no interactive UI
        '--model', model,
        '--max-turns', '10',
        '--dangerously-skip-permissions',  // For automated use
        prompt
      ];

      // Set up environment
      const env = { ...process.env };
      if (this.apiKey) {
        env.ANTHROPIC_API_KEY = this.apiKey;
      }

      console.log(`[ClaudeCode] Running with model: ${model}`);

      const proc = spawn('npx', ['@anthropic-ai/claude-code', ...args], {
        env,
        cwd: process.cwd(),
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      let stdout = '';
      let stderr = '';

      proc.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      proc.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      proc.on('error', (error) => {
        reject(new Error(`Failed to start Claude Code: ${error.message}`));
      });

      proc.on('close', (code) => {
        if (code === 0) {
          resolve(stdout.trim() || 'Task completed');
        } else {
          // Check for common errors
          if (stderr.includes('not logged in') || stderr.includes('login')) {
            reject(new Error('Claude Code not logged in. Run "claude /login" to authenticate.'));
          } else if (stderr.includes('API key')) {
            reject(new Error('Claude Code API key issue. Set ANTHROPIC_API_KEY or run "claude /login".'));
          } else {
            reject(new Error(`Claude Code exited with code ${code}: ${stderr || stdout}`));
          }
        }
      });

      // Timeout after 5 minutes
      setTimeout(() => {
        proc.kill();
        reject(new Error('Claude Code timed out after 5 minutes'));
      }, 5 * 60 * 1000);
    });
  }
}

/**
 * Check if Claude Code is configured and working
 */
export async function checkClaudeCodeStatus(): Promise<{
  configured: boolean;
  loggedIn: boolean;
  error?: string;
}> {
  return new Promise((resolve) => {
    // Run a simple check to see if Claude Code is available and logged in
    const proc = spawn('npx', ['@anthropic-ai/claude-code', '--version'], {
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 10000,
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    proc.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    proc.on('error', () => {
      resolve({
        configured: false,
        loggedIn: false,
        error: 'Claude Code not installed',
      });
    });

    proc.on('close', (code) => {
      if (code === 0 && stdout.includes('claude-code')) {
        // Check if logged in by trying a simple prompt
        checkLogin().then(resolve);
      } else {
        resolve({
          configured: false,
          loggedIn: false,
          error: stderr || 'Claude Code not available',
        });
      }
    });
  });
}

async function checkLogin(): Promise<{
  configured: boolean;
  loggedIn: boolean;
  error?: string;
}> {
  return new Promise((resolve) => {
    const proc = spawn('npx', [
      '@anthropic-ai/claude-code',
      '--print',
      '--max-turns', '1',
      'Say "ok"'
    ], {
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 30000,
    });

    let stderr = '';

    proc.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    proc.on('error', () => {
      resolve({
        configured: true,
        loggedIn: false,
        error: 'Failed to run Claude Code',
      });
    });

    proc.on('close', (code) => {
      if (code === 0) {
        resolve({
          configured: true,
          loggedIn: true,
        });
      } else {
        resolve({
          configured: true,
          loggedIn: false,
          error: stderr.includes('login')
            ? 'Not logged in - run "claude /login"'
            : stderr || 'Claude Code error',
        });
      }
    });
  });
}
